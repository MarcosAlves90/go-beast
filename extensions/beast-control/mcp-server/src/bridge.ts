import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { createServer, IncomingMessage, ServerResponse } from "node:http";

const PORT = parseInt(process.env.BEAST_CONTROL_PORT ?? "7331", 10);
const TOKEN_PORT = PORT + 1; // one-shot HTTP endpoint for token delivery
const REQUEST_TIMEOUT_MS = 30_000;
const HANDSHAKE_TIMEOUT_MS = 5_000; // extension has 5s to send the token after connecting

// Token generated once per process — never transmitted over the network in an exposed form
const SESSION_TOKEN = randomUUID();
let tokenDelivered = false; // the token can only be fetched once

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
};

// Normalizes errors before exposing to Claude — removes stack traces and internal paths
function sanitizeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/\/[^\s"')]+/g, (p) =>
    p.includes("node_modules") || p.includes("/beast-control/") ? "<internal>" : p
  );
}

let extensionSocket: WebSocket | null = null;
const pending = new Map<string, PendingRequest>();

// ── One-shot HTTP endpoint for token delivery ─────────────────────────────────
// The extension does GET http://127.0.0.1:TOKEN_PORT/token once.
// CORS blocks external pages from making this fetch (Private Network Access).
// After first delivery, the endpoint returns 404 — replay is impossible.

function startTokenServer(): Promise<void> {
  return new Promise((resolve) => {
    const http = createServer((req: IncomingMessage, res: ServerResponse) => {
      // Private Network Access: only accepts requests from extension or localhost origins
      const origin = req.headers["origin"] ?? "";
      const isMozExtension = origin.startsWith("moz-extension://");
      const isLocalhost = origin === "" || origin.startsWith("http://127.0.0.1") || origin.startsWith("http://localhost");

      if (!isMozExtension && !isLocalhost) {
        res.writeHead(403).end();
        return;
      }

      if (req.url !== "/token" || req.method !== "GET") {
        res.writeHead(404).end();
        return;
      }

      if (tokenDelivered) {
        res.writeHead(404).end();
        return;
      }

      tokenDelivered = true;
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin || "*",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ token: SESSION_TOKEN }));
    });

    http.listen(TOKEN_PORT, "127.0.0.1", () => resolve());
  });
}

// ── WebSocket server ──────────────────────────────────────────────────────────

export async function startBridge(): Promise<void> {
  await startTokenServer();

  const wss = new WebSocketServer({ host: "127.0.0.1", port: PORT });

  // SEC-002: mitigates DNS rebinding by rejecting connections with a Host outside 127.0.0.1/localhost
  wss.on("headers", (_headers, req) => {
    const host = req.headers["host"] ?? "";
    const allowed =
      host === "127.0.0.1" || host.startsWith("127.0.0.1:") ||
      host === "localhost"  || host.startsWith("localhost:");
    if (!allowed) {
      req.destroy(new Error(`Rejected WebSocket Host: ${host}`));
    }
  });

  wss.on("connection", (socket) => {
    // Limit to 1 simultaneous connection
    if (extensionSocket && extensionSocket.readyState === WebSocket.OPEN) {
      extensionSocket.close(1001, "New connection received — closing previous session");
    }

    // SEC-001: waits for the handshake token before marking the connection as authenticated
    let authenticated = false;
    const handshakeTimer = setTimeout(() => {
      if (!authenticated) {
        socket.close(1008, "Handshake timeout — token not received");
      }
    }, HANDSHAKE_TIMEOUT_MS);

    socket.once("message", (raw) => {
      let frame: { type?: string; token?: string };
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        socket.close(1008, "Invalid handshake frame");
        return;
      }

      if (frame.type !== "handshake" || frame.token !== SESSION_TOKEN) {
        socket.close(1008, "Invalid handshake token");
        return;
      }

      clearTimeout(handshakeTimer);
      authenticated = true;
      extensionSocket = socket;

      // Confirm handshake to the extension
      socket.send(JSON.stringify({ type: "handshake_ok" }));

      // From here on, process normal messages
      socket.on("message", (rawMsg) => {
        let msg: { requestId?: string; ok?: boolean; result?: unknown; error?: string | null };
        try {
          msg = JSON.parse(rawMsg.toString());
        } catch {
          return;
        }

        const { requestId } = msg;
        if (!requestId) return;

        const pending_req = pending.get(requestId);
        if (!pending_req) return;

        clearTimeout(pending_req.timer);
        pending.delete(requestId);

        if (msg.ok) {
          pending_req.resolve(msg.result ?? {});
        } else {
          pending_req.reject(new Error(msg.error ?? "Unknown error in extension"));
        }
      });

      socket.on("close", () => {
        if (extensionSocket === socket) extensionSocket = null;
        for (const [id, req] of pending) {
          clearTimeout(req.timer);
          req.reject(new Error("Connection to extension closed"));
          pending.delete(id);
        }
      });
    });
  });

  await new Promise<void>((resolve) => wss.once("listening", resolve));
}

export function sendCommand(type: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  if (!extensionSocket || extensionSocket.readyState !== WebSocket.OPEN) {
    return Promise.reject(
      new Error(
        "beast-control extension not connected. Open Zen Browser and verify that the extension is installed and connected."
      )
    );
  }

  const requestId = randomUUID();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`Timeout (${REQUEST_TIMEOUT_MS / 1000}s) waiting for extension response`));
    }, REQUEST_TIMEOUT_MS);

    pending.set(requestId, { resolve, reject, timer });

    try {
      extensionSocket!.send(JSON.stringify({ requestId, type, payload }));
    } catch (e) {
      clearTimeout(timer);
      pending.delete(requestId);
      reject(new Error(`Failed to send command: ${sanitizeError(e)}`));
    }
  });
}

export { sanitizeError };
