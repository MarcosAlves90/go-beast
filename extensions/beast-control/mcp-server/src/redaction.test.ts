// Tests the sensitive field redaction logic from the content script.
// content.js uses browser globals (document, Element) — here we simulate
// with minimal objects to test only the field selection logic.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// ── Replicates the SENSITIVE_SELECTORS logic from content.js ─────────────────
// Kept in sync manually. If content.js changes, update here.

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

// Minimal simulation of Element.matches() for browser-less tests
function matchesSelector(attrs: Record<string, string>, selector: string): boolean {
  // [attr="value"]
  const exact = selector.match(/^\[(\w+)="([^"]+)"\]$/);
  if (exact) return attrs[exact[1]] === exact[2];

  // [attr~="value"] — value is one of the space-separated words
  const word = selector.match(/^\[(\w+)~="([^"]+)"\]$/);
  if (word) return (attrs[word[1]] ?? "").split(/\s+/).includes(word[2]);

  // [attr*="value" i] — contains substring, case-insensitive
  const contains = selector.match(/^\[(\w+)\*="([^"]+)"\s+i\]$/);
  if (contains) return (attrs[contains[1]] ?? "").toLowerCase().includes(contains[2].toLowerCase());

  return false;
}

function isSensitive(attrs: Record<string, string>): boolean {
  return SENSITIVE_SELECTORS.some((sel) => matchesSelector(attrs, sel));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("isSensitive — fields that should be redacted", () => {
  test("password field by type", () => {
    assert.ok(isSensitive({ type: "password" }));
  });

  test("tel field by type", () => {
    assert.ok(isSensitive({ type: "tel" }));
  });

  test("cc-number field by autocomplete", () => {
    assert.ok(isSensitive({ autocomplete: "cc-number" }));
  });

  test("cc-number alongside other autocomplete tokens", () => {
    assert.ok(isSensitive({ autocomplete: "billing cc-number" }));
  });

  test("cc-csc field by autocomplete", () => {
    assert.ok(isSensitive({ autocomplete: "cc-csc" }));
  });

  test("field with name containing 'card' (case-insensitive)", () => {
    assert.ok(isSensitive({ name: "cardNumber" }));
    assert.ok(isSensitive({ name: "CARD_NUM" }));
    assert.ok(isSensitive({ name: "creditcard" }));
  });

  test("field with name containing 'cvv'", () => {
    assert.ok(isSensitive({ name: "cvv" }));
    assert.ok(isSensitive({ name: "CVV2" }));
  });

  test("field with name containing 'ssn'", () => {
    assert.ok(isSensitive({ name: "ssn" }));
    assert.ok(isSensitive({ name: "user_ssn" }));
  });

  test("field with name containing 'cpf'", () => {
    assert.ok(isSensitive({ name: "cpf" }));
    assert.ok(isSensitive({ name: "CPF_input" }));
  });

  test("field with name containing 'password'", () => {
    assert.ok(isSensitive({ name: "password" }));
    assert.ok(isSensitive({ name: "confirm_password" }));
  });
});

describe("isSensitive — fields that should NOT be redacted", () => {
  test("email field", () => {
    assert.ok(!isSensitive({ type: "email" }));
  });

  test("generic text field", () => {
    assert.ok(!isSensitive({ type: "text", name: "username" }));
  });

  test("search field", () => {
    assert.ok(!isSensitive({ type: "search" }));
  });

  test("number field without sensitive name", () => {
    assert.ok(!isSensitive({ type: "number", name: "quantity" }));
  });

  test("field with non-sensitive autocomplete name", () => {
    assert.ok(!isSensitive({ autocomplete: "given-name" }));
    assert.ok(!isSensitive({ autocomplete: "email" }));
  });

  test("field with no attributes", () => {
    assert.ok(!isSensitive({}));
  });

  test("field name containing a false positive substring", () => {
    // 'cardigan' contains 'card' — should be sensitive by design (acceptable false positive)
    assert.ok(isSensitive({ name: "cardigan" }));
    // but 'discount_code' should not
    assert.ok(!isSensitive({ name: "discount_code" }));
  });
});

