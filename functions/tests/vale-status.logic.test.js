"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  calcularAtualizacao,
  normalizarStatus,
  protegerRestauracao,
} = require("../../vale-status.js");

test("normaliza somente PENDENTE como aberto", () => {
  assert.equal(normalizarStatus("PENDENTE"), "PENDENTE");
  assert.equal(normalizarStatus("PAGO"), "PAGO");
  assert.equal(normalizarStatus(undefined), "PAGO");
});

test("desconto cria patch versionado com usuário autenticado", () => {
  const timestamp = {server: true};
  const resultado = calcularAtualizacao(
      {tipo: "Vale", status: "PENDENTE", statusVersion: 4},
      "PAGO",
      "uid-financeiro",
      timestamp,
  );

  assert.equal(resultado.changed, true);
  assert.equal(resultado.statusAtual, "PENDENTE");
  assert.deepEqual(resultado.patch, {
    status: "PAGO",
    statusVersion: 5,
    statusUpdatedAt: timestamp,
    statusUpdatedBy: "uid-financeiro",
  });
});

test("repetir o mesmo desconto é idempotente", () => {
  const primeiro = calcularAtualizacao({tipo: "Vale", status: "PENDENTE"}, "PAGO", "uid-1", "t1");
  const estadoConfirmado = {tipo: "Vale", ...primeiro.patch};
  const segundo = calcularAtualizacao(estadoConfirmado, "PAGO", "uid-2", "t2");

  assert.equal(primeiro.changed, true);
  assert.equal(segundo.changed, false);
  assert.equal(segundo.statusAtual, "PAGO");
});

test("backup antigo não reabre vale já descontado", () => {
  const atual = {
    id: 10,
    tipo: "Vale",
    status: "PAGO",
    statusVersion: 3,
    statusUpdatedAt: "servidor",
    statusUpdatedBy: "uid-1",
  };
  const backup = {id: 10, tipo: "Vale", status: "PENDENTE", valor: 50};
  const protegido = protegerRestauracao(atual, backup);

  assert.equal(protegido.status, "PAGO");
  assert.equal(protegido.statusVersion, 3);
  assert.equal(protegido.statusUpdatedAt, "servidor");
  assert.equal(protegido.statusUpdatedBy, "uid-1");
  assert.equal(protegido.valor, 50);
});

test("vale novo restaurado não aceita metadados de controle do arquivo", () => {
  const protegido = protegerRestauracao(null, {
    id: 11,
    tipo: "Vale",
    status: "PENDENTE",
    statusVersion: 99,
    statusUpdatedAt: "forjado",
    statusUpdatedBy: "forjado",
  });

  assert.equal(protegido.status, "PENDENTE");
  assert.equal("statusVersion" in protegido, false);
  assert.equal("statusUpdatedAt" in protegido, false);
  assert.equal("statusUpdatedBy" in protegido, false);
});

test("rejeita alteração de não-vale e status inválido", () => {
  assert.throws(() => calcularAtualizacao({tipo: "Pagamento"}, "PAGO", "uid", "t"), /não é um vale/);
  assert.throws(() => calcularAtualizacao({tipo: "Vale"}, "ATIVO", "uid", "t"), /Status de vale inválido/);
  assert.throws(() => calcularAtualizacao({tipo: "Vale"}, "PAGO", "", "t"), /Usuário autenticado ausente/);
});
