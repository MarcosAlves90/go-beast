import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { createServer, IncomingMessage, ServerResponse } from "node:http";

const PORT = parseInt(process.env.BEAST_CONTROL_PORT ?? "7331", 10);
const TOKEN_PORT = PORT + 1; // endpoint HTTP one-shot para entrega do token
const REQUEST_TIMEOUT_MS = 30_000;
const HANDSHAKE_TIMEOUT_MS = 5_000; // extensão tem 5s para enviar o token após conectar

// Token gerado uma vez por processo — nunca trafega pela rede de forma exposta
const SESSION_TOKEN = randomUUID();
let tokenDelivered = false; // o token só pode ser buscado uma vez

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
};

// Normaliza erros antes de expor ao Claude — remove stack traces e caminhos internos
function sanitizeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/\/[^\s"')]+/g, (p) =>
    p.includes("node_modules") || p.includes("/beast-control/") ? "<internal>" : p
  );
}

let extensionSocket: WebSocket | null = null;
const pending = new Map<string, PendingRequest>();

// ── Endpoint HTTP one-shot para entrega do token ──────────────────────────────
// A extensão faz GET http://127.0.0.1:TOKEN_PORT/token uma vez.
// CORS bloqueia páginas externas de fazerem esse fetch (Private Network Access).
// Após a primeira entrega, o endpoint retorna 404 — replay impossível.

function startTokenServer(): Promise<void> {
  return new Promise((resolve) => {
    const http = createServer((req: IncomingMessage, res: ServerResponse) => {
      // Private Network Access: só aceita requisições de origem de extensão ou localhost
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

  // SEC-002: mitiga DNS rebinding rejeitando conexões com Host fora de 127.0.0.1/localhost
  wss.on("headers", (_headers, req) => {
    const host = req.headers["host"] ?? "";
    const allowed =
      host === "127.0.0.1" || host.startsWith("127.0.0.1:") ||
      host === "localhost"  || host.startsWith("localhost:");
    if (!allowed) {
      req.destroy(new Error(`Host WebSocket rejeitado: ${host}`));
    }
  });

  wss.on("connection", (socket) => {
    // Limita a 1 conexão simultânea
    if (extensionSocket && extensionSocket.readyState === WebSocket.OPEN) {
      extensionSocket.close(1001, "Nova conexão recebida — encerrando sessão anterior");
    }

    // SEC-001: aguarda o token de handshake antes de marcar conexão como autenticada
    let authenticated = false;
    const handshakeTimer = setTimeout(() => {
      if (!authenticated) {
        socket.close(1008, "Timeout de handshake — token não recebido");
      }
    }, HANDSHAKE_TIMEOUT_MS);

    socket.once("message", (raw) => {
      let frame: { type?: string; token?: string };
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        socket.close(1008, "Frame de handshake inválido");
        return;
      }

      if (frame.type !== "handshake" || frame.token !== SESSION_TOKEN) {
        socket.close(1008, "Token de handshake inválido");
        return;
      }

      clearTimeout(handshakeTimer);
      authenticated = true;
      extensionSocket = socket;

      // Confirma handshake para a extensão
      socket.send(JSON.stringify({ type: "handshake_ok" }));

      // A partir daqui, processa mensagens normais
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
          pending_req.reject(new Error(msg.error ?? "Erro desconhecido na extensão"));
        }
      });

      socket.on("close", () => {
        if (extensionSocket === socket) extensionSocket = null;
        for (const [id, req] of pending) {
          clearTimeout(req.timer);
          req.reject(new Error("Conexão com a extensão encerrada"));
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
        "Extensão beast-control não conectada. Abra o Zen Browser e verifique se a extensão está instalada e conectada."
      )
    );
  }

  const requestId = randomUUID();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`Timeout (${REQUEST_TIMEOUT_MS / 1000}s) aguardando resposta da extensão`));
    }, REQUEST_TIMEOUT_MS);

    pending.set(requestId, { resolve, reject, timer });

    try {
      extensionSocket!.send(JSON.stringify({ requestId, type, payload }));
    } catch (e) {
      clearTimeout(timer);
      pending.delete(requestId);
      reject(new Error(`Falha ao enviar comando: ${sanitizeError(e)}`));
    }
  });
}

export { sanitizeError };
