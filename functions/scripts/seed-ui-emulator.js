"use strict";

const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore} = require("firebase-admin/firestore");

const projectId = process.env.PAINEL_RH_EMULATOR_PROJECT || "demo-painelrh";
initializeApp({projectId});
const auth = getAuth();
const db = getFirestore("sera");

async function main() {
  await auth.createUser({
    uid: "uid-admin-ui",
    email: "admin@painelrh.invalid",
    password: "TesteSeguro123!",
    displayName: "admin",
  }).catch((error) => {
    if (!error || error.code !== "auth/uid-already-exists") throw error;
  });

  await db.collection("rh_users").doc("uid-admin-ui").set({
    uid: "uid-admin-ui",
    user: "admin",
    email: "admin@painelrh.invalid",
    isAdmin: true,
    active: true,
    perms: {func: true, pres: true, fin: true, moto: true, boletos: true},
  });
  await db.collection("rh_funcionarios").doc("func-ui").set({
    id: "func-ui",
    nome: "Funcionário de Teste",
    empresa: "Emulador",
    cargo: "Teste",
    tipo: "Diaria",
    salario: 100,
    statusFuncionario: "Ativo",
  });
  console.log("Emulador preparado para o teste visual.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
