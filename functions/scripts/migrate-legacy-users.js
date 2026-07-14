"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {applicationDefault, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {FieldValue, getFirestore} = require("firebase-admin/firestore");

const PROJECT_ID = "sistema-presenca-99791";
const DATABASE_ID = "sera";
const INPUT_PATH = path.resolve(__dirname, "..", "migration-input.local.json");
const REPORT_PATH = path.resolve(__dirname, "..", "migration-report.local.json");
const mode = process.argv.includes("--stage")
  ? "stage"
  : process.argv.includes("--finalize") ? "finalize" : "preflight";

initializeApp({credential: applicationDefault(), projectId: PROJECT_ID});
const auth = getAuth();
const db = getFirestore(DATABASE_ID);

function readInput() {
  if (!fs.existsSync(INPUT_PATH)) return {replacementPasswords: {}, duplicateResolution: {}};
  const parsed = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
  return {
    replacementPasswords: parsed.replacementPasswords || {},
    duplicateResolution: parsed.duplicateResolution || {},
  };
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function permissions(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
      ["func", "pres", "fin", "moto", "boletos"].map((key) => [key, source[key] === true]),
  );
}

function writeReport(report) {
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, {mode: 0o600});
}

function selectLegacyUsers(docs, input) {
  const groups = new Map();
  docs.forEach((entry) => {
    const username = normalizeUsername(entry.data.user);
    if (!groups.has(username)) groups.set(username, []);
    groups.get(username).push(entry);
  });

  const selected = [];
  const conflicts = [];
  for (const [username, entries] of groups.entries()) {
    if (entries.length === 1) {
      selected.push(entries[0]);
      continue;
    }

    const selectedDocId = String(input.duplicateResolution[username] || "");
    const chosen = entries.find((entry) => entry.id === selectedDocId);
    if (!chosen) {
      conflicts.push({
        username,
        documentIds: entries.map((entry) => entry.id),
        permissionsByDocument: entries.map((entry) => ({
          documentId: entry.id,
          isAdmin: entry.data.isAdmin === true,
          perms: permissions(entry.data.perms),
        })),
      });
      continue;
    }
    selected.push({...chosen, duplicateDocumentIds: entries.map((entry) => entry.id)});
  }
  return {selected, conflicts};
}

async function loadLegacyUsers() {
  const snapshot = await db.collection("rh_users").get();
  return snapshot.docs
      .map((document) => ({id: document.id, data: document.data()}))
      .filter((entry) => typeof entry.data.pass === "string");
}

async function buildPlan() {
  const input = readInput();
  const legacyUsers = await loadLegacyUsers();
  const {selected, conflicts} = selectLegacyUsers(legacyUsers, input);
  const invalidUsernames = selected
      .filter((entry) => !/^[a-z0-9._-]{3,40}$/.test(normalizeUsername(entry.data.user)))
      .map((entry) => ({documentId: entry.id, username: normalizeUsername(entry.data.user)}));
  const shortPasswords = [];

  const users = selected.map((entry) => {
    const username = normalizeUsername(entry.data.user);
    const replacement = input.replacementPasswords[entry.id];
    const originalPassword = entry.data.pass;
    const password = typeof replacement === "string" && replacement.length > 0
      ? replacement
      : originalPassword;
    if (password.length < 6 || password.length > 128) {
      shortPasswords.push({documentId: entry.id, username, currentLength: originalPassword.length});
    }
    return {
      documentId: entry.id,
      duplicateDocumentIds: entry.duplicateDocumentIds || [entry.id],
      username,
      email: `${username}@painelrh.invalid`,
      password,
      isAdmin: entry.data.isAdmin === true,
      perms: permissions(entry.data.perms),
    };
  });

  return {legacyUsers, users, conflicts, invalidUsernames, shortPasswords};
}

async function stageUser(user) {
  let authUser;
  let created = false;
  try {
    authUser = await auth.getUserByEmail(user.email);
  } catch (error) {
    if (!error || error.code !== "auth/user-not-found") throw error;
    authUser = await auth.createUser({
      email: user.email,
      password: user.password,
      displayName: user.username,
      disabled: false,
    });
    created = true;
  }

  const profileRef = db.collection("rh_users").doc(authUser.uid);
  try {
    await profileRef.set({
      uid: authUser.uid,
      user: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      active: true,
      perms: user.perms,
      legacyDocumentIds: user.duplicateDocumentIds,
      migrationStagedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  } catch (error) {
    if (created) await auth.deleteUser(authUser.uid).catch(() => {});
    throw error;
  }
  return {uid: authUser.uid, username: user.username, created};
}

async function verifyStage(users) {
  const verified = [];
  for (const user of users) {
    const authUser = await auth.getUserByEmail(user.email);
    const profile = await db.collection("rh_users").doc(authUser.uid).get();
    if (!profile.exists || profile.data().uid !== authUser.uid || profile.data().active !== true) {
      throw new Error(`Perfil autenticado inválido para ${user.username}.`);
    }
    if (Object.prototype.hasOwnProperty.call(profile.data(), "pass")) {
      throw new Error(`O perfil autenticado de ${user.username} ainda contém senha.`);
    }
    verified.push({uid: authUser.uid, username: user.username});
  }
  return verified;
}

async function main() {
  const plan = await buildPlan();
  const publicReport = {
    mode,
    legacyDocumentCount: plan.legacyUsers.length,
    uniqueUserCount: plan.users.length,
    duplicateConflicts: plan.conflicts,
    invalidUsernames: plan.invalidUsernames,
    passwordReplacementsRequired: plan.shortPasswords,
  };
  writeReport(publicReport);

  if (plan.conflicts.length || plan.invalidUsernames.length || plan.shortPasswords.length) {
    console.error(JSON.stringify(publicReport, null, 2));
    console.error(`Migração bloqueada. Resolva os itens em ${INPUT_PATH} sem enviar senhas ao GitHub.`);
    process.exitCode = 2;
    return;
  }

  if (mode === "preflight") {
    console.log(JSON.stringify({...publicReport, readyToStage: true}, null, 2));
    return;
  }

  if (mode === "stage") {
    const staged = [];
    for (const user of plan.users) staged.push(await stageUser(user));
    await verifyStage(plan.users);
    writeReport({...publicReport, staged, stagedAt: new Date().toISOString()});
    console.log(`Etapa preparada: ${staged.length} usuários autenticados, senhas legadas ainda preservadas.`);
    return;
  }

  if (!process.argv.includes("--confirm-remove-passwords")) {
    throw new Error("Use --confirm-remove-passwords somente depois de validar todos os logins.");
  }

  const verified = await verifyStage(plan.users);
  const batch = db.batch();
  plan.legacyUsers.forEach((entry) => batch.delete(db.collection("rh_users").doc(entry.id)));
  await batch.commit();
  writeReport({...publicReport, verified, finalizedAt: new Date().toISOString()});
  console.log(`Finalização concluída: ${plan.legacyUsers.length} documentos com senha foram removidos.`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
