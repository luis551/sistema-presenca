"use strict";

const assert = require("node:assert/strict");
const {initializeApp: initializeAdminApp} = require("firebase-admin/app");
const {getAuth: getAdminAuth} = require("firebase-admin/auth");
const {getFirestore: getAdminFirestore} = require("firebase-admin/firestore");
const {deleteApp, initializeApp} = require("firebase/app");
const {connectAuthEmulator, getAuth, signInWithEmailAndPassword} = require("firebase/auth");
const {connectFunctionsEmulator, getFunctions, httpsCallable} = require("firebase/functions");

const PROJECT_ID = "demo-painelrh";
const DATABASE_ID = "sera";
const PASSWORD = "TesteSeguro123!";

function perms(overrides = {}) {
  return {func: false, pres: false, fin: false, moto: false, boletos: false, ...overrides};
}

async function expectCallableDenied(promise, expectedCode, label) {
  try {
    await promise;
    assert.fail(`${label}: chamada deveria ser negada`);
  } catch (error) {
    if (error && error.code === "ERR_ASSERTION") throw error;
    assert.equal(error.code, `functions/${expectedCode}`, `${label}: código inesperado`);
  }
}

async function callableClient(name, email = null, password = PASSWORD) {
  const app = initializeApp({projectId: PROJECT_ID, apiKey: "demo-key"}, `${name}-${Date.now()}-${Math.random()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", {disableWarnings: true});
  if (email) await signInWithEmailAndPassword(auth, email, password);
  const functions = getFunctions(app, "us-central1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  return {
    app,
    createUser: httpsCallable(functions, "createRhUser"),
    updateUser: httpsCallable(functions, "updateRhUser"),
    disableUser: httpsCallable(functions, "disableRhUser"),
  };
}

async function seed() {
  initializeAdminApp({projectId: PROJECT_ID});
  const auth = getAdminAuth();
  const db = getAdminFirestore(DATABASE_ID);
  await auth.createUser({uid: "uid-admin", email: "admin@painelrh.invalid", password: PASSWORD});
  await db.collection("rh_users").doc("uid-admin").set({
    uid: "uid-admin",
    user: "admin",
    email: "admin@painelrh.invalid",
    isAdmin: true,
    active: true,
    perms: perms(),
  });
  await auth.createUser({uid: "uid-normal", email: "normal@painelrh.invalid", password: PASSWORD});
  await db.collection("rh_users").doc("uid-normal").set({
    uid: "uid-normal",
    user: "normal",
    email: "normal@painelrh.invalid",
    isAdmin: false,
    active: true,
    perms: perms({pres: true}),
  });
  return {auth, db};
}

async function run() {
  const {auth: adminAuth, db} = await seed();
  const clients = [];
  try {
    const guest = await callableClient("guest");
    clients.push(guest);
    await expectCallableDenied(guest.createUser({
      user: "intruso", password: PASSWORD, isAdmin: true, perms: perms(),
    }), "unauthenticated", "visitante cria usuário");

    const normal = await callableClient("normal", "normal@painelrh.invalid");
    clients.push(normal);
    await expectCallableDenied(normal.createUser({
      user: "intruso", password: PASSWORD, isAdmin: true, perms: perms(),
    }), "permission-denied", "usuário comum cria administrador");

    const admin = await callableClient("admin", "admin@painelrh.invalid");
    clients.push(admin);
    const created = (await admin.createUser({
      user: "created",
      password: "SenhaCriada123!",
      isAdmin: false,
      perms: perms({fin: true}),
    })).data;
    assert.ok(created.uid, "função deve retornar o UID criado");
    assert.equal(created.email, "created@painelrh.invalid");
    const createdProfile = await db.collection("rh_users").doc(created.uid).get();
    assert.equal(createdProfile.data().uid, created.uid);
    assert.equal(createdProfile.data().perms.fin, true);
    assert.equal(Object.prototype.hasOwnProperty.call(createdProfile.data(), "pass"), false, "perfil não pode conter senha");
    await adminAuth.getUserByEmail("created@painelrh.invalid");

    const updated = (await admin.updateUser({
      uid: created.uid,
      user: "updated",
      password: "SenhaAtualizada123!",
      isAdmin: false,
      active: true,
      perms: perms({moto: true}),
    })).data;
    assert.equal(updated.user, "updated");
    assert.equal(updated.perms.moto, true);
    await adminAuth.getUserByEmail("updated@painelrh.invalid");
    const updatedLogin = await callableClient("updated-login", "updated@painelrh.invalid", "SenhaAtualizada123!");
    clients.push(updatedLogin);

    await expectCallableDenied(admin.updateUser({
      uid: "uid-admin",
      user: "admin",
      password: "",
      isAdmin: false,
      active: true,
      perms: perms(),
    }), "failed-precondition", "administrador remove o próprio papel");

    await admin.disableUser({uid: created.uid});
    const disabledAuth = await adminAuth.getUser(created.uid);
    const disabledProfile = await db.collection("rh_users").doc(created.uid).get();
    assert.equal(disabledAuth.disabled, true);
    assert.equal(disabledProfile.data().active, false);
    const disabledClient = await callableClient("disabled");
    clients.push(disabledClient);
    const disabledAuthClient = getAuth(disabledClient.app);
    await assert.rejects(
        signInWithEmailAndPassword(disabledAuthClient, "updated@painelrh.invalid", "SenhaAtualizada123!"),
        /auth\/user-disabled/,
    );

    const audits = await db.collection("rh_audit").where("uid", "==", "uid-admin").get();
    assert.ok(audits.size >= 3, "ações administrativas devem registrar o UID do administrador");
    audits.forEach((entry) => {
      assert.equal(Object.prototype.hasOwnProperty.call(entry.data(), "user"), false);
      assert.ok(entry.data().createdAt, "auditoria administrativa deve usar timestamp do servidor");
    });

    console.log("12 testes das funções administrativas passaram.");
  } finally {
    await Promise.all(clients.map(({app}) => deleteApp(app)));
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
