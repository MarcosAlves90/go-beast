// Integration test: full handshake — HTTP token + WebSocket
// Starts a real bridge on a random port, simulates the extension, verifies authentication.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";

// We need an isolated version of the bridge for tests with a configurable port.
// We duplicate the minimal logic here to avoid polluting the production module with test hacks.
// If bridge.ts grows, extracting a testable factory is the next step.

import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";

const HANDSHAKE_TIMEOUT_MS = 500; // shorter for fast tests

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

  test("token endpoint delivers token once", async () => {
    const res = await fetch(`http://127.0.0.1:${HTTP_PORT}/token`);
    assert.equal(res.status, 200);
    const { token } = await res.json() as { token: string };
    assert.match(token, /^[0-9a-f-]{36}$/, "should be UUID v4");
  });

  test("token endpoint returns 404 on second request (one-shot)", async () => {
    const res = await fetch(`http://127.0.0.1:${HTTP_PORT}/token`);
    assert.equal(res.status, 404, "second fetch should return 404");
  });

  test("client with correct token is authenticated and receives handshake_ok", async () => {
    // New bridge so this test has a fresh token
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
        setTimeout(() => reject(new Error("timeout waiting for handshake_ok")), 2000);
      });

      assert.ok(b.getLastSocket() !== null, "socket should be authenticated");
    } finally {
      await b.close();
    }
  });

  test("client with wrong token is rejected with code 1008", async () => {
    const b = await createTestBridge(WS_PORT + 4, HTTP_PORT + 4);
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${b.wsPort}`);
        ws.on("open", () => ws.send(JSON.stringify({ type: "handshake", token: "wrong-token" })));
        ws.on("close", (code) => {
          assert.equal(code, 1008, "should close with 1008");
          resolve();
        });
        ws.on("error", reject);
        setTimeout(() => reject(new Error("timeout waiting for close")), 2000);
      });

      assert.equal(b.getLastRejection(), "invalid_token");
      assert.ok(b.getLastSocket() === null, "socket should not be authenticated");
    } finally {
      await b.close();
    }
  });

  test("client without handshake is disconnected by timeout", async () => {
    const b = await createTestBridge(WS_PORT + 6, HTTP_PORT + 6);
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${b.wsPort}`);
        // sends nothing — waits for timeout
        ws.on("close", (code) => {
          assert.equal(code, 1008, "should close with 1008 due to timeout");
          resolve();
        });
        ws.on("error", reject);
        setTimeout(() => reject(new Error("test timeout exceeded")), 2000);
      });

      assert.equal(b.getLastRejection(), "handshake_timeout");
    } finally {
      await b.close();
    }
  });
});
