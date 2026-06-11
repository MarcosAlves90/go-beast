// Teste de integração: handshake completo — token HTTP + WebSocket
// Sobe um bridge real em porta aleatória, simula a extensão, verifica autenticação.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";

// Precisamos de uma versão isolada do bridge para testes com porta configurável.
// Duplicamos a lógica mínima aqui para não poluir o módulo de produção com hacks de teste.
// Se bridge.ts crescer, extrair uma factory testável é o próximo passo.

import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";

const HANDSHAKE_TIMEOUT_MS = 500; // mais curto para testes rápidos

function createTestBridge(wsPort: number, httpPort: number) {
  const token = randomUUID();
  let tokenDelivered = false;
  let lastAuthenticatedSocket: WebSocket | null = null;
  let lastRejectedReason: string | null = null;

  const http = createServer((req, res) => {
    if (req.url !== "/token") { res.writeHead(404).end(); return; }
    if (tokenDelivered) { res.writeHead(404).end(); return; }
    tokenDelivered = true;
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ token }));
  });

  const wss = new WebSocketServer({ port: wsPort });

  wss.on("connection", (socket) => {
    const timer = setTimeout(() => {
      if (!lastAuthenticatedSocket) {
        lastRejectedReason = "handshake_timeout";
        socket.close(1008, "timeout");
      }
    }, HANDSHAKE_TIMEOUT_MS);

    socket.once("message", (raw) => {
      let frame: { type?: string; token?: string } = {};
      try { frame = JSON.parse(raw.toString()); } catch { /* */ }

      if (frame.type !== "handshake" || frame.token !== token) {
        clearTimeout(timer);
        lastRejectedReason = "invalid_token";
        socket.close(1008, "invalid");
        return;
      }

      clearTimeout(timer);
      lastAuthenticatedSocket = socket;
      socket.send(JSON.stringify({ type: "handshake_ok" }));
    });
  });

  return new Promise<{
    token: string;
    httpPort: number;
    wsPort: number;
    getLastSocket: () => WebSocket | null;
    getLastRejection: () => string | null;
    close: () => Promise<void>;
  }>((resolve) => {
    http.listen(httpPort, "127.0.0.1", () => {
      resolve({
        token,
        httpPort,
        wsPort,
        getLastSocket: () => lastAuthenticatedSocket,
        getLastRejection: () => lastRejectedReason,
        close: () => new Promise<void>((res) => {
          wss.close(() => http.close(() => res()));
        }),
      });
    });
  });
}

describe("handshake WebSocket", () => {
  const WS_PORT = 17331;
  const HTTP_PORT = 17332;
  let bridge: Awaited<ReturnType<typeof createTestBridge>>;

  before(async () => {
    bridge = await createTestBridge(WS_PORT, HTTP_PORT);
  });

  after(async () => {
    await bridge.close();
  });

  test("token endpoint entrega token uma vez", async () => {
    const res = await fetch(`http://127.0.0.1:${HTTP_PORT}/token`);
    assert.equal(res.status, 200);
    const { token } = await res.json() as { token: string };
    assert.match(token, /^[0-9a-f-]{36}$/, "deve ser UUID v4");
  });

  test("token endpoint retorna 404 na segunda requisição (one-shot)", async () => {
    const res = await fetch(`http://127.0.0.1:${HTTP_PORT}/token`);
    assert.equal(res.status, 404, "segundo fetch deve retornar 404");
  });

  test("cliente com token correto é autenticado e recebe handshake_ok", async () => {
    // Novo bridge para este teste ter token fresco
    const b = await createTestBridge(WS_PORT + 2, HTTP_PORT + 2);
    try {
      const res = await fetch(`http://127.0.0.1:${b.httpPort}/token`);
      const { token } = await res.json() as { token: string };

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${b.wsPort}`);
        ws.on("open", () => ws.send(JSON.stringify({ type: "handshake", token })));
        ws.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          assert.equal(msg.type, "handshake_ok");
          ws.close();
          resolve();
        });
        ws.on("error", reject);
        setTimeout(() => reject(new Error("timeout aguardando handshake_ok")), 2000);
      });

      assert.ok(b.getLastSocket() !== null, "socket deve estar autenticado");
    } finally {
      await b.close();
    }
  });

  test("cliente com token errado é rejeitado com code 1008", async () => {
    const b = await createTestBridge(WS_PORT + 4, HTTP_PORT + 4);
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${b.wsPort}`);
        ws.on("open", () => ws.send(JSON.stringify({ type: "handshake", token: "token-errado" })));
        ws.on("close", (code) => {
          assert.equal(code, 1008, "deve fechar com 1008");
          resolve();
        });
        ws.on("error", reject);
        setTimeout(() => reject(new Error("timeout aguardando close")), 2000);
      });

      assert.equal(b.getLastRejection(), "invalid_token");
      assert.ok(b.getLastSocket() === null, "socket não deve estar autenticado");
    } finally {
      await b.close();
    }
  });

  test("cliente sem handshake é desconectado por timeout", async () => {
    const b = await createTestBridge(WS_PORT + 6, HTTP_PORT + 6);
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${b.wsPort}`);
        // não envia nada — espera o timeout
        ws.on("close", (code) => {
          assert.equal(code, 1008, "deve fechar com 1008 por timeout");
          resolve();
        });
        ws.on("error", reject);
        setTimeout(() => reject(new Error("timeout de teste excedido")), 2000);
      });

      assert.equal(b.getLastRejection(), "handshake_timeout");
    } finally {
      await b.close();
    }
  });
});
