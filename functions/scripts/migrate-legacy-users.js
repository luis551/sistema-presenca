"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {initializeApp} = require("firebase/app");
const {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} = require("firebase/auth");
const {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
} = require("firebase/firestore");

const PROJECT_ID = "sistema-presenca-99791";
const DATABASE_ID = "sera";
const INPUT_PATH = path.resolve(__dirname, "..", "migration-input.local.json");
const REPORT_PATH = path.resolve(__dirname, "..", "migration-report.local.json");
const LEGACY_PLUS_12 = "@legacy+12";
const ADMIN_ACCESS_TOKEN = process.env.FIREBASE_CLI_ACCESS_TOKEN || "";
const FIRESTORE_REST_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
const mode = process.argv.includes("--stage")
  ? "stage"
  : process.argv.includes("--verify")
    ? "verify"
    : process.argv.includes("--finalize") ? "finalize" : "preflight";

const app = initializeApp({
  apiKey: "AIzaSyBQFsxlyyyLVTpIAdbjdoIOyFA6zIj9Ka4",
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
});
const auth = getAuth(app);
const db = getFirestore(app, DATABASE_ID);

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

function decodeFirestoreValue(value) {
  if (Object.prototype.hasOwnProperty.call(value, "stringValue")) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) return value.booleanValue;
  if (value.mapValue) {
    return Object.fromEntries(
        Object.entries(value.mapValue.fields || {}).map(([key, nested]) => [key, decodeFirestoreValue(nested)]),
    );
  }
  return null;
}

async function adminFirestoreRequest(url, options = {}) {
  if (!ADMIN_ACCESS_TOKEN) throw new Error("Credencial administrativa temporária ausente.");
  const response = await fetch(url, {
    ...options,
    headers: {Authorization: `Bearer ${ADMIN_ACCESS_TOKEN}`, ...(options.headers || {})},
  });
  if (!response.ok) throw new Error(`Firestore REST ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
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
  if (ADMIN_ACCESS_TOKEN) {
    const result = await adminFirestoreRequest(`${FIRESTORE_REST_ROOT}/rh_users?pageSize=100`);
    return (result.documents || [])
        .map((document) => ({
          id: document.name.split("/").pop(),
          data: Object.fromEntries(
              Object.entries(document.fields || {}).map(([key, value]) => [key, decodeFirestoreValue(value)]),
          ),
        }))
        .filter((entry) => typeof entry.data.pass === "string");
  }
  const snapshot = await getDocs(collection(db, "rh_users"));
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
    const password = replacement === LEGACY_PLUS_12
      ? `${originalPassword}12`
      : typeof replacement === "string" && replacement.length > 0
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
  let credential;
  let created = false;
  try {
    credential = await createUserWithEmailAndPassword(auth, user.email, user.password);
    created = true;
  } catch (error) {
    if (!error || error.code !== "auth/email-already-in-use") throw error;
    credential = await signInWithEmailAndPassword(auth, user.email, user.password);
  }

  const authUser = credential.user;
  try {
    if (authUser.displayName !== user.username) {
      await updateProfile(authUser, {displayName: user.username});
    }
    await setDoc(doc(db, "rh_users", authUser.uid), {
      uid: authUser.uid,
      user: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      active: true,
      perms: user.perms,
      legacyDocumentIds: user.duplicateDocumentIds,
      migrationStagedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, {merge: true});
  } catch (error) {
    if (created) await deleteUser(authUser).catch(() => {});
    throw error;
  }
  await signOut(auth);
  return {uid: authUser.uid, username: user.username, created};
}

async function verifyStage(users) {
  const verified = [];
  for (const user of users) {
    const credential = await signInWithEmailAndPassword(auth, user.email, user.password);
    const authUser = credential.user;
    const profile = await getDoc(doc(db, "rh_users", authUser.uid));
    if (!profile.exists() || profile.data().uid !== authUser.uid || profile.data().active !== true) {
      throw new Error(`Perfil autenticado inválido para ${user.username}.`);
    }
    if (Object.prototype.hasOwnProperty.call(profile.data(), "pass")) {
      throw new Error(`O perfil autenticado de ${user.username} ainda contém senha.`);
    }
    verified.push({uid: authUser.uid, username: user.username});
    await signOut(auth);
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

  if (mode === "verify") {
    const verified = await verifyStage(plan.users);
    writeReport({...publicReport, verified, verifiedAt: new Date().toISOString()});
    console.log(`Verificação concluída: ${verified.length} logins e perfis válidos.`);
    return;
  }

  if (!process.argv.includes("--confirm-remove-passwords")) {
    throw new Error("Use --confirm-remove-passwords somente depois de validar todos os logins.");
  }

  const verified = await verifyStage(plan.users);
  for (const entry of plan.legacyUsers) {
    if (ADMIN_ACCESS_TOKEN) {
      await adminFirestoreRequest(`${FIRESTORE_REST_ROOT}/rh_users/${encodeURIComponent(entry.id)}`, {method: "DELETE"});
    } else {
      await deleteDoc(doc(db, "rh_users", entry.id));
    }
  }
  writeReport({...publicReport, verified, finalizedAt: new Date().toISOString()});
  console.log(`Finalização concluída: ${plan.legacyUsers.length} documentos com senha foram removidos.`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
