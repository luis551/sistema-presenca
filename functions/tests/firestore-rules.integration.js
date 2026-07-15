"use strict";

const assert = require("node:assert/strict");
const {initializeApp: initializeAdminApp} = require("firebase-admin/app");
const {getAuth: getAdminAuth} = require("firebase-admin/auth");
const {getFirestore: getAdminFirestore} = require("firebase-admin/firestore");
const {deleteApp, initializeApp} = require("firebase/app");
const {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
} = require("firebase/auth");
const {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} = require("firebase/firestore");

const PROJECT_ID = "demo-painelrh";
const DATABASE_ID = "sera";
const PASSWORD = "TesteSeguro123!";
const profiles = {
  admin: {uid: "uid-admin", user: "admin", isAdmin: true, active: true},
  presence: {uid: "uid-presence", user: "presence", isAdmin: false, active: true},
  finance: {uid: "uid-finance", user: "finance", isAdmin: false, active: true},
  inactive: {uid: "uid-inactive", user: "inactive", isAdmin: false, active: false},
};

function perms(overrides = {}) {
  return {func: false, pres: false, fin: false, moto: false, boletos: false, ...overrides};
}

async function expectDenied(promise, label) {
  try {
    await promise;
    assert.fail(`${label}: operação deveria ser negada`);
  } catch (error) {
    if (error && error.code === "ERR_ASSERTION") throw error;
    assert.match(String(error && error.code || error), /permission-denied/i, `${label}: erro inesperado`);
  }
}

async function expectAllowed(promise, label) {
  try {
    return await promise;
  } catch (error) {
    assert.fail(`${label}: operação deveria ser permitida (${error.code || error.message})`);
  }
}

async function clientFor(name, email = null) {
  const app = initializeApp({projectId: PROJECT_ID, apiKey: "demo-key"}, `${name}-${Date.now()}-${Math.random()}`);
  const auth = getAuth(app);
  const firestore = getFirestore(app, DATABASE_ID);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", {disableWarnings: true});
  connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
  if (email) await signInWithEmailAndPassword(auth, email, PASSWORD);
  return {app, auth, firestore};
}

async function seed() {
  initializeAdminApp({projectId: PROJECT_ID});
  const adminAuth = getAdminAuth();
  const adminDb = getAdminFirestore(DATABASE_ID);
  const entries = [
    {...profiles.admin, email: "admin@painelrh.invalid", perms: perms()},
    {...profiles.presence, email: "presence@painelrh.invalid", perms: perms({pres: true})},
    {...profiles.finance, email: "finance@painelrh.invalid", perms: perms({fin: true})},
    {...profiles.inactive, email: "inactive@painelrh.invalid", perms: perms({pres: true, fin: true})},
  ];

  for (const profile of entries) {
    await adminAuth.createUser({uid: profile.uid, email: profile.email, password: PASSWORD});
    await adminDb.collection("rh_users").doc(profile.uid).set(profile);
  }
  await adminAuth.createUser({uid: "uid-no-profile", email: "noprofile@painelrh.invalid", password: PASSWORD});
  await adminDb.collection("rh_funcionarios").doc("seed").set({id: "seed", nome: "Teste"});
  await adminDb.collection("rh_pagamentos").doc("vale-status").set({
    id: "vale-status",
    tipo: "Vale",
    status: "PENDENTE",
    valor: 50,
  });
  return adminDb;
}

async function run() {
  const adminDb = await seed();
  const clients = [];
  try {
    const visitor = await clientFor("visitor");
    clients.push(visitor);
    await expectDenied(getDoc(doc(visitor.firestore, "rh_funcionarios", "seed")), "visitante lê dados");

    const noProfile = await clientFor("no-profile", "noprofile@painelrh.invalid");
    clients.push(noProfile);
    await expectDenied(getDoc(doc(noProfile.firestore, "rh_funcionarios", "seed")), "autenticado sem perfil lê dados");

    const inactive = await clientFor("inactive", "inactive@painelrh.invalid");
    clients.push(inactive);
    await expectDenied(getDoc(doc(inactive.firestore, "rh_funcionarios", "seed")), "perfil inativo lê dados");

    const presence = await clientFor("presence", "presence@painelrh.invalid");
    clients.push(presence);
    await expectAllowed(getDoc(doc(presence.firestore, "rh_funcionarios", "seed")), "usuário ativo lê dados");
    await expectAllowed(setDoc(doc(presence.firestore, "rh_presencas", "2026-07-14"), {data: "2026-07-14", registros: []}), "presença grava presença");
    await expectDenied(setDoc(doc(presence.firestore, "rh_pagamentos", "p1"), {id: "p1"}), "presença grava financeiro");
    await expectAllowed(getDoc(doc(presence.firestore, "rh_users", profiles.presence.uid)), "usuário lê o próprio perfil");
    await expectDenied(getDocs(collection(presence.firestore, "rh_users")), "usuário lista perfis");
    await expectDenied(updateDoc(doc(presence.firestore, "rh_users", profiles.presence.uid), {isAdmin: true}), "usuário eleva a própria permissão");

    const finance = await clientFor("finance", "finance@painelrh.invalid");
    clients.push(finance);
    await expectAllowed(setDoc(doc(finance.firestore, "rh_pagamentos", "p2"), {
      id: "p2",
      tipo: "Pagamento",
      status: "PAGO",
    }), "financeiro grava pagamento");
    const valeRef = doc(finance.firestore, "rh_pagamentos", "vale-status");
    await expectDenied(updateDoc(valeRef, {status: "PAGO"}), "versão antiga altera status sem controle");
    await expectAllowed(updateDoc(valeRef, {
      status: "PAGO",
      statusVersion: 1,
      statusUpdatedAt: serverTimestamp(),
      statusUpdatedBy: profiles.finance.uid,
    }), "financeiro altera status com versão, horário e UID");
    await expectAllowed(updateDoc(valeRef, {desc: "ajuste sem mudar status"}), "financeiro edita vale preservando status");
    await expectDenied(updateDoc(valeRef, {
      status: "PENDENTE",
      statusVersion: 1,
      statusUpdatedAt: serverTimestamp(),
      statusUpdatedBy: profiles.finance.uid,
    }), "financeiro reutiliza versão de status");
    await expectDenied(updateDoc(valeRef, {
      status: "PENDENTE",
      statusVersion: 2,
      statusUpdatedAt: serverTimestamp(),
      statusUpdatedBy: profiles.admin.uid,
    }), "financeiro informa UID diferente do autenticado");
    await expectAllowed(setDoc(doc(finance.firestore, "rh_extras", "e1"), {id: "e1"}), "financeiro grava extra");
    await expectDenied(setDoc(doc(finance.firestore, "rh_presencas", "2026-07-15"), {data: "2026-07-15"}), "financeiro grava presença");

    const auditRef = doc(collection(presence.firestore, "rh_audit"));
    await expectAllowed(setDoc(auditRef, {
      uid: profiles.presence.uid,
      acao: "Teste",
      detalhes: "Entrada válida",
      createdAt: serverTimestamp(),
    }), "auditoria com UID autenticado");
    await expectDenied(setDoc(doc(collection(presence.firestore, "rh_audit")), {
      uid: profiles.admin.uid,
      acao: "Fraude",
      detalhes: "UID forjado",
      createdAt: serverTimestamp(),
    }), "auditoria com UID forjado");
    await expectDenied(setDoc(doc(collection(presence.firestore, "rh_audit")), {
      uid: profiles.presence.uid,
      acao: "Data falsa",
      detalhes: "Sem timestamp do servidor",
      createdAt: new Date(),
    }), "auditoria com data enviada pelo navegador");
    await expectDenied(getDoc(auditRef), "não-admin lê auditoria");
    await expectDenied(updateDoc(auditRef, {detalhes: "alterado"}), "auditoria é alterada");
    await expectDenied(deleteDoc(auditRef), "auditoria é apagada");

    const admin = await clientFor("admin", "admin@painelrh.invalid");
    clients.push(admin);
    await expectAllowed(setDoc(doc(admin.firestore, "rh_boletos", "b1"), {id: "b1"}), "admin grava boletos");
    await expectAllowed(setDoc(doc(admin.firestore, "rh_entregas", "m1"), {id: "m1"}), "admin grava entregas");
    await expectAllowed(getDocs(collection(admin.firestore, "rh_users")), "admin lista perfis");
    await expectAllowed(getDoc(doc(admin.firestore, "rh_audit", auditRef.id)), "admin lê auditoria");
    await expectDenied(updateDoc(doc(admin.firestore, "rh_users", profiles.finance.uid), {isAdmin: true}), "admin altera perfil direto do navegador");
    await expectDenied(setDoc(doc(admin.firestore, "colecao_desconhecida", "x"), {x: true}), "admin grava coleção desconhecida");

    const storedAudit = await adminDb.collection("rh_audit").doc(auditRef.id).get();
    assert.equal(storedAudit.data().uid, profiles.presence.uid, "UID persistido deve ser o UID autenticado");
    assert.ok(storedAudit.data().createdAt, "timestamp do servidor deve existir");
    console.log("27 testes de regras passaram para o banco nomeado 'sera'.");
  } finally {
    await Promise.all(clients.map(({app}) => deleteApp(app)));
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
