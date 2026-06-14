import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sanitizeError } from "./bridge.js";

describe("sanitizeError", () => {
  test("returns the message of a normal Error intact", () => {
    assert.equal(sanitizeError(new Error("element not found")), "element not found");
  });

  test("converts non-Error to string", () => {
    assert.equal(sanitizeError("raw string"), "raw string");
    assert.equal(sanitizeError(42), "42");
  });

  test("removes internal beast-control path", () => {
    const err = new Error("failure at /Users/marcos.lopes/beast-control/mcp-server/src/bridge.ts:42");
    const result = sanitizeError(err);
    assert.ok(!result.includes("/beast-control/"), `should not expose path: ${result}`);
    assert.ok(result.includes("<internal>"), `should replace with <internal>: ${result}`);
  });

  test("removes node_modules path", () => {
    const err = new Error("error at /Users/marcos.lopes/beast-control/mcp-server/node_modules/ws/lib/websocket.js:100");
    const result = sanitizeError(err);
    assert.ok(!result.includes("node_modules"), `should not expose node_modules: ${result}`);
  });

  test("preserves external paths unrelated to the project", () => {
    const err = new Error("failed to access /etc/hosts");
    const result = sanitizeError(err);
    // /etc/hosts does not contain 'node_modules' or '/beast-control/' so it is not replaced
    assert.ok(result.includes("/etc/hosts"), `should preserve external path: ${result}`);
  });
});
