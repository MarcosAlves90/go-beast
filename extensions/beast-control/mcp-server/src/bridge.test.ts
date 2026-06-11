import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sanitizeError } from "./bridge.js";

describe("sanitizeError", () => {
  test("retorna a mensagem de um Error normal intacta", () => {
    assert.equal(sanitizeError(new Error("elemento não encontrado")), "elemento não encontrado");
  });

  test("converte não-Error para string", () => {
    assert.equal(sanitizeError("string crua"), "string crua");
    assert.equal(sanitizeError(42), "42");
  });

  test("remove caminho interno do beast-control", () => {
    const err = new Error("falha em /Users/marcos.lopes/beast-control/mcp-server/src/bridge.ts:42");
    const result = sanitizeError(err);
    assert.ok(!result.includes("/beast-control/"), `não deve expor caminho: ${result}`);
    assert.ok(result.includes("<internal>"), `deve substituir por <internal>: ${result}`);
  });

  test("remove caminho de node_modules", () => {
    const err = new Error("erro em /Users/marcos.lopes/beast-control/mcp-server/node_modules/ws/lib/websocket.js:100");
    const result = sanitizeError(err);
    assert.ok(!result.includes("node_modules"), `não deve expor node_modules: ${result}`);
  });

  test("preserva caminhos externos não relacionados ao projeto", () => {
    const err = new Error("falha ao acessar /etc/hosts");
    const result = sanitizeError(err);
    // /etc/hosts não contém 'node_modules' nem '/beast-control/' então não é substituído
    assert.ok(result.includes("/etc/hosts"), `deve preservar caminho externo: ${result}`);
  });
});
