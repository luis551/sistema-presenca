"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  calcularPagamento,
  obterRegraPagamento,
} = require("../../moto-payment-rules.js");

test("mantém a regra noturna de 40 + 4 entre 14/07 e 11/08", () => {
  assert.deepEqual(obterRegraPagamento("Noite", "2026-07-14"), {
    valorDiaria: 40,
    valorPorEntrega: 4,
    versao: "noturno-2026-07-14-40-4",
  });
  assert.equal(obterRegraPagamento("Noite", "2026-08-11").valorDiaria, 40);
});

test("aplica 60 + 5 à noite a partir de 12/08/2026", () => {
  const inicio = obterRegraPagamento("Noite", "2026-08-12");
  const depois = obterRegraPagamento("Noite", "2026-09-01");

  assert.equal(inicio.valorDiaria, 60);
  assert.equal(inicio.valorPorEntrega, 5);
  assert.equal(inicio.versao, "noturno-2026-08-12-60-5");
  assert.equal(depois, inicio);
});

test("mantém a regra diurna em 0 + 9", () => {
  assert.deepEqual(obterRegraPagamento("Dia", "2026-08-12"), {
    valorDiaria: 0,
    valorPorEntrega: 9,
    versao: "diurno-0-9",
  });
});

test("calcula o total noturno com diária 60 e cinco por entrega", () => {
  const resultado = calcularPagamento("Noite", "2026-08-12", 10);
  assert.equal(resultado.totalReceber, 110);
  assert.equal(resultado.totalEntregas, 10);
});

test("preserva a regra noturna anterior a 14/07", () => {
  const resultado = calcularPagamento("Noite", "2026-07-13", 10);
  assert.equal(resultado.totalReceber, 110);
  assert.equal(resultado.regra.versao, "noturno-legado-60-5");
});

test("rejeita quantidade negativa ou fracionada", () => {
  assert.throws(() => calcularPagamento("Noite", "2026-08-12", -1), /inteiro/);
  assert.throws(() => calcularPagamento("Noite", "2026-08-12", 1.5), /inteiro/);
});
