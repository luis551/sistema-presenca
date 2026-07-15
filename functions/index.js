"use strict";

const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {FieldValue, getFirestore} = require("firebase-admin/firestore");
const {setGlobalOptions} = require("firebase-functions/v2");
const {HttpsError, onCall} = require("firebase-functions/v2/https");

initializeApp();
setGlobalOptions({region: "us-central1", maxInstances: 10});

const auth = getAuth();
const db = getFirestore("sera");
const USERNAME_RE = /^[a-z0-9._-]{3,40}$/;
const PERMISSION_KEYS = ["func", "pres", "fin", "moto", "boletos"];

function normalizeUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw new HttpsError(
        "invalid-argument",
        "O usuário deve ter de 3 a 40 caracteres: letras, números, ponto, hífen ou sublinhado.",
    );
  }
  return username;
}

function authEmailFor(username) {
  return `${username}@painelrh.invalid`;
}

function normalizePermissions(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(PERMISSION_KEYS.map((key) => [key, source[key] === true]));
}

function requirePassword(value, optional = false) {
  const password = String(value || "");
  if (optional && password.length === 0) return null;
  if (password.length < 6 || password.length > 128) {
    throw new HttpsError("invalid-argument", "A senha deve ter entre 6 e 128 caracteres.");
  }
  return password;
}

async function requireAdmin(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "Faça login novamente.");
  }

  const snapshot = await db.collection("rh_users").doc(request.auth.uid).get();
  const profile = snapshot.data();
  if (!snapshot.exists || profile.active !== true || profile.isAdmin !== true) {
    throw new HttpsError("permission-denied", "Somente administradores podem gerenciar acessos.");
  }
  return {uid: request.auth.uid, profile};
}

async function assertNotLastAdmin(targetUid) {
  const target = await db.collection("rh_users").doc(targetUid).get();
  if (!target.exists || target.data().isAdmin !== true || target.data().active !== true) return;

  const adminProfiles = await db.collection("rh_users")
      .where("isAdmin", "==", true)
      .get();
  const activeAdminCount = adminProfiles.docs.filter((entry) => entry.data().active === true).length;
  if (activeAdminCount <= 1) {
    throw new HttpsError("failed-precondition", "O último administrador ativo não pode ser removido.");
  }
}

async function recordAdminAudit(actorUid, action, details) {
  await db.collection("rh_audit").add({
    uid: actorUid,
    acao: action,
    detalhes: details,
    createdAt: FieldValue.serverTimestamp(),
  });
}

exports.createRhUser = onCall(async (request) => {
  const actor = await requireAdmin(request);
  const username = normalizeUsername(request.data && request.data.user);
  const password = requirePassword(request.data && request.data.password);
  const isAdmin = request.data && request.data.isAdmin === true;
  const perms = normalizePermissions(request.data && request.data.perms);
  const email = authEmailFor(username);

  let userRecord;
  try {
    userRecord = await auth.createUser({
      email,
      password,
      displayName: username,
      disabled: false,
    });
  } catch (error) {
    if (error && error.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "Este nome de usuário já existe.");
    }
    throw error;
  }

  const profile = {
    uid: userRecord.uid,
    user: username,
    email,
    isAdmin,
    active: true,
    perms,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  try {
    await db.collection("rh_users").doc(userRecord.uid).create(profile);
  } catch (error) {
    await auth.deleteUser(userRecord.uid).catch(() => {});
    throw error;
  }

  await recordAdminAudit(actor.uid, "Admin", `Criou o acesso ${username} (${userRecord.uid})`);
  return {uid: userRecord.uid, user: username, email, isAdmin, active: true, perms};
});

exports.updateRhUser = onCall(async (request) => {
  const actor = await requireAdmin(request);
  const uid = String(request.data && request.data.uid || "").trim();
  if (!uid) throw new HttpsError("invalid-argument", "UID obrigatório.");

  const currentSnapshot = await db.collection("rh_users").doc(uid).get();
  if (!currentSnapshot.exists) throw new HttpsError("not-found", "Usuário não encontrado.");

  const current = currentSnapshot.data();
  const username = normalizeUsername(request.data && request.data.user);
  const password = requirePassword(request.data && request.data.password, true);
  const isAdmin = request.data && request.data.isAdmin === true;
  const active = request.data && request.data.active !== false;
  const perms = normalizePermissions(request.data && request.data.perms);

  if (uid === actor.uid && (!isAdmin || !active)) {
    throw new HttpsError("failed-precondition", "Você não pode remover o próprio acesso administrativo.");
  }
  if (current.isAdmin === true && current.active === true && (!isAdmin || !active)) {
    await assertNotLastAdmin(uid);
  }

  const email = authEmailFor(username);
  const authChanges = {
    email,
    displayName: username,
    disabled: !active,
  };
  if (password) authChanges.password = password;
  await auth.updateUser(uid, authChanges);

  await db.collection("rh_users").doc(uid).set({
    uid,
    user: username,
    email,
    isAdmin,
    active,
    perms,
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});

  await recordAdminAudit(actor.uid, "Admin", `Atualizou o acesso ${username} (${uid})`);
  return {uid, user: username, email, isAdmin, active, perms};
});

exports.disableRhUser = onCall(async (request) => {
  const actor = await requireAdmin(request);
  const uid = String(request.data && request.data.uid || "").trim();
  if (!uid) throw new HttpsError("invalid-argument", "UID obrigatório.");
  if (uid === actor.uid) {
    throw new HttpsError("failed-precondition", "Você não pode desativar a própria conta.");
  }

  await assertNotLastAdmin(uid);
  const snapshot = await db.collection("rh_users").doc(uid).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Usuário não encontrado.");

  await auth.updateUser(uid, {disabled: true});
  await snapshot.ref.set({active: false, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  await recordAdminAudit(actor.uid, "Admin", `Desativou o acesso ${snapshot.data().user} (${uid})`);
  return {uid, active: false};
});
