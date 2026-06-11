// Testa a lógica de redação de campos sensíveis do content script.
// O content.js usa globals do browser (document, Element) — aqui simulamos
// com objetos mínimos para testar apenas a lógica de seleção de campos.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// ── Replica a lógica de SENSITIVE_SELECTORS do content.js ────────────────────
// Mantida em sync manualmente. Se content.js mudar, atualizar aqui.

const SENSITIVE_SELECTORS = [
  '[type="password"]',
  '[type="tel"]',
  '[autocomplete~="cc-number"]',
  '[autocomplete~="cc-csc"]',
  '[name*="card" i]',
  '[name*="cvv" i]',
  '[name*="ssn" i]',
  '[name*="cpf" i]',
  '[name*="password" i]',
];

// Simulação mínima de Element.matches() para testes sem browser
function matchesSelector(attrs: Record<string, string>, selector: string): boolean {
  // [attr="value"]
  const exact = selector.match(/^\[(\w+)="([^"]+)"\]$/);
  if (exact) return attrs[exact[1]] === exact[2];

  // [attr~="value"] — value é uma das palavras separadas por espaço
  const word = selector.match(/^\[(\w+)~="([^"]+)"\]$/);
  if (word) return (attrs[word[1]] ?? "").split(/\s+/).includes(word[2]);

  // [attr*="value" i] — contém substring, case-insensitive
  const contains = selector.match(/^\[(\w+)\*="([^"]+)"\s+i\]$/);
  if (contains) return (attrs[contains[1]] ?? "").toLowerCase().includes(contains[2].toLowerCase());

  return false;
}

function isSensitive(attrs: Record<string, string>): boolean {
  return SENSITIVE_SELECTORS.some((sel) => matchesSelector(attrs, sel));
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe("isSensitive — campos que devem ser redactados", () => {
  test("campo password por type", () => {
    assert.ok(isSensitive({ type: "password" }));
  });

  test("campo tel por type", () => {
    assert.ok(isSensitive({ type: "tel" }));
  });

  test("campo cc-number por autocomplete", () => {
    assert.ok(isSensitive({ autocomplete: "cc-number" }));
  });

  test("campo cc-number junto com outros tokens de autocomplete", () => {
    assert.ok(isSensitive({ autocomplete: "billing cc-number" }));
  });

  test("campo cc-csc por autocomplete", () => {
    assert.ok(isSensitive({ autocomplete: "cc-csc" }));
  });

  test("campo com name contendo 'card' (case-insensitive)", () => {
    assert.ok(isSensitive({ name: "cardNumber" }));
    assert.ok(isSensitive({ name: "CARD_NUM" }));
    assert.ok(isSensitive({ name: "creditcard" }));
  });

  test("campo com name contendo 'cvv'", () => {
    assert.ok(isSensitive({ name: "cvv" }));
    assert.ok(isSensitive({ name: "CVV2" }));
  });

  test("campo com name contendo 'ssn'", () => {
    assert.ok(isSensitive({ name: "ssn" }));
    assert.ok(isSensitive({ name: "user_ssn" }));
  });

  test("campo com name contendo 'cpf'", () => {
    assert.ok(isSensitive({ name: "cpf" }));
    assert.ok(isSensitive({ name: "CPF_input" }));
  });

  test("campo com name contendo 'password'", () => {
    assert.ok(isSensitive({ name: "password" }));
    assert.ok(isSensitive({ name: "confirm_password" }));
  });
});

describe("isSensitive — campos que NÃO devem ser redactados", () => {
  test("campo email", () => {
    assert.ok(!isSensitive({ type: "email" }));
  });

  test("campo text genérico", () => {
    assert.ok(!isSensitive({ type: "text", name: "username" }));
  });

  test("campo search", () => {
    assert.ok(!isSensitive({ type: "search" }));
  });

  test("campo number sem nome sensível", () => {
    assert.ok(!isSensitive({ type: "number", name: "quantity" }));
  });

  test("campo com autocomplete de nome não sensível", () => {
    assert.ok(!isSensitive({ autocomplete: "given-name" }));
    assert.ok(!isSensitive({ autocomplete: "email" }));
  });

  test("campo sem atributos", () => {
    assert.ok(!isSensitive({}));
  });

  test("campo name que contém substring de falso positivo", () => {
    // 'cardigan' contém 'card' — deve ser sensível por design (false positive aceitável)
    assert.ok(isSensitive({ name: "cardigan" }));
    // mas 'discount_code' não
    assert.ok(!isSensitive({ name: "discount_code" }));
  });
});

