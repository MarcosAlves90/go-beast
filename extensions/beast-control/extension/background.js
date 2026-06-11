const DEFAULT_PORT = 7331;
const KEEPALIVE_INTERVAL_MINUTES = 0.4; // ~24s — abaixo do limite de 30s do SW
const CONTENT_SCRIPT_READY_RETRIES = 5;
const CONTENT_SCRIPT_READY_DELAY_MS = 150;

let ws = null;
let reconnectTimer = null;
let reconnectDelay = 1000;

// ── Logger mínimo ─────────────────────────────────────────────────────────────

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LOG_LEVEL = LOG_LEVELS["info"];

function log(level, msg, ctx = {}) {
  if (LOG_LEVELS[level] < LOG_LEVEL) return;
  const entry = { ts: new Date().toISOString(), level, msg, ...ctx };
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.debug;
  fn("[beast-control]", JSON.stringify(entry));
}

// ── Estado ────────────────────────────────────────────────────────────────────

async function getState() {
  const data = await browser.storage.local.get(["port", "bypassActive", "recentCommands", "evalEnabled"]);
  return {
    port: data.port ?? DEFAULT_PORT,
    bypassActive: data.bypassActive ?? false,
    recentCommands: data.recentCommands ?? [],
    evalEnabled: data.evalEnabled ?? false,
  };
}

async function saveState(patch) {
  await browser.storage.local.set(patch);
}

async function pushCommand(entry) {
  const { recentCommands } = await getState();
  const updated = [entry, ...recentCommands].slice(0, 5);
  await saveState({ recentCommands: updated });
}

// ── Badge / ícone dinâmico ────────────────────────────────────────────────────

// Gera ImageData 19×19 com anel + C — ícone de toolbar do beast-control.
// OffscreenCanvas está disponível no Service Worker do Firefox 112+.
function makeIconImageData(dotColor) {
  const SIZE = 19;
  try {
    const canvas = new OffscreenCanvas(SIZE, SIZE);
    const ctx = canvas.getContext("2d");

    // Fundo arredondado escuro
    ctx.fillStyle = "#111114";
    roundRect(ctx, 1, 1, SIZE-2, SIZE-2, 4);
    ctx.fill();

    // Anel
    ctx.strokeStyle = dotColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(SIZE/2, SIZE/2, 7, 0, 2*Math.PI);
    ctx.stroke();

    // Letra C
    ctx.strokeStyle = "#e2e2e8";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(SIZE/2, SIZE/2, 4, Math.PI * 0.35, Math.PI * 1.65);
    ctx.stroke();

    // Dot de status (canto inferior direito)
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(SIZE - 4, SIZE - 4, 2.5, 0, 2*Math.PI);
    ctx.fill();

    // Anel de contraste ao redor do dot
    ctx.strokeStyle = "#111114";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(SIZE - 4, SIZE - 4, 3, 0, 2*Math.PI);
    ctx.stroke();

    return ctx.getImageData(0, 0, SIZE, SIZE);
  } catch {
    return null;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

async function updateBadge() {
  const { bypassActive } = await getState();
  const connected = ws?.readyState === WebSocket.OPEN;

  let dotColor, badgeText, badgeBg;
  if (bypassActive) {
    dotColor = "#f85149"; badgeText = "!"; badgeBg = "#4a1a1a";
  } else if (connected) {
    dotColor = "#34d058"; badgeText = "";  badgeBg = "#34d058";
  } else {
    dotColor = "#6b6b7a"; badgeText = "";  badgeBg = "#6b6b7a";
  }

  browser.action.setBadgeText({ text: badgeText });
  browser.action.setBadgeBackgroundColor({ color: badgeBg });

  const imageData = makeIconImageData(dotColor);
  if (imageData) {
    browser.action.setIcon({ imageData: { 19: imageData } }).catch(() => {});
  }
}

// ── WebSocket + handshake ─────────────────────────────────────────────────────

// SEC-001: busca o token de sessão do endpoint HTTP one-shot antes de conectar.
// O endpoint só entrega o token uma vez e recusa origens externas.
async function fetchSessionToken(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port + 1}/token`);
    if (!res.ok) return null;
    const { token } = await res.json();
    return token ?? null;
  } catch {
    return null;
  }
}

async function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const { port } = await getState();

  // Busca o token antes de abrir o WebSocket
  const sessionToken = await fetchSessionToken(port);
  if (!sessionToken) {
    log("warn", "token de sessão indisponível — MCP server ainda não está pronto ou já foi buscado");
    scheduleReconnect();
    return;
  }

  const url = `ws://127.0.0.1:${port}`;
  log("info", "conectando ao MCP server", { url });
  ws = new WebSocket(url);

  ws.onopen = () => {
    // Envia o token como primeiro frame — o server só aceita mensagens após validar
    ws.send(JSON.stringify({ type: "handshake", token: sessionToken }));
    log("info", "handshake enviado");
  };

  ws.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      log("warn", "mensagem WebSocket inválida (não é JSON)");
      return;
    }

    // Primeiro frame de retorno é sempre a confirmação do handshake
    if (msg.type === "handshake_ok") {
      reconnectDelay = 1000;
      log("info", "conectado e autenticado");
      updateBadge();
      notifyPopup({ event: "connected" });
      return;
    }

    await handleCommand(msg);
  };

  ws.onclose = () => {
    ws = null;
    log("info", "desconectado do MCP server", { proximaTentativa: `${reconnectDelay}ms` });
    updateBadge();
    notifyPopup({ event: "disconnected" });
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    connect();
  }, reconnectDelay);
}

// Resolve qual aba usar para um comando.
// Prioridade: tabId explícito > tabIndex > tabTitle (parcial, case-insensitive) > aba ativa
async function resolveTab(tabId, tabIndex, tabTitle) {
  if (tabId != null) {
    const tab = await browser.tabs.get(tabId).catch(() => null);
    return tab?.id ?? null;
  }
  if (tabIndex != null) {
    const tabs = await browser.tabs.query({ index: tabIndex });
    return tabs[0]?.id ?? null;
  }
  if (tabTitle != null) {
    const all = await browser.tabs.query({});
    const match = all.find((t) => t.title?.toLowerCase().includes(tabTitle.toLowerCase()));
    return match?.id ?? null;
  }
  const active = await browser.tabs.query({ active: true, currentWindow: true });
  return active[0]?.id ?? null;
}

function sendResponse(requestId, ok, result, error) {
  if (ws?.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ requestId, ok, result: result ?? {}, error: error ?? null }));
}

// ── Dispatcher de comandos ────────────────────────────────────────────────────

async function handleCommand(msg) {
  const { requestId, type, payload } = msg;
  if (!requestId || !type) return;

  log("debug", "comando recebido", { requestId, type });

  let ok = true;
  let result = {};
  let error = null;

  try {
    const { bypassActive } = await getState();

    // Resolve a aba alvo: tabId explícito > índice > título > aba ativa
    const tabId = await resolveTab(payload?.tabId, payload?.tabIndex, payload?.tabTitle);
    if (!tabId) throw new Error("Nenhuma aba encontrada");

    switch (type) {
      case "ping": {
        const tab = await browser.tabs.get(tabId);
        result = { alive: true, version: "0.1.0", activeUrl: tab.url };
        break;
      }

      case "list_tabs": {
        const allTabs = await browser.tabs.query({});
        result = allTabs.map((t) => ({ id: t.id, index: t.index, title: t.title, url: t.url, active: t.active }));
        break;
      }

      case "navigate":
        await browser.tabs.update(tabId, { url: payload.url });
        await waitForTabLoad(tabId);
        const tab = await browser.tabs.get(tabId);
        result = { finalUrl: tab.url };
        break;

      case "screenshot": {
        // captureVisibleTab captura a janela atual — se a aba alvo não for a ativa, foca nela primeiro
        const targetTab = await browser.tabs.get(tabId);
        if (!targetTab.active) {
          await browser.tabs.update(tabId, { active: true });
          // aguarda um frame para o browser renderizar
          await new Promise((r) => setTimeout(r, 100));
        }
        const rects = bypassActive ? [] : await getContentResult(tabId, "get_sensitive_rects", {});
        const dataUrl = await browser.tabs.captureVisibleTab(targetTab.windowId, { format: "png" });
        let redactedImage = dataUrl;
        let redactError = null;
        if (!bypassActive && rects.length > 0) {
          try {
            redactedImage = await redactScreenshot(tabId, dataUrl, rects);
          } catch (e) {
            // fallback: retorna screenshot sem redação com flag de aviso
            redactError = e.message ?? String(e);
            log("warn", "falha ao redigir screenshot — retornando sem redação", { error: redactError });
          }
        }
        result = {
          image: redactedImage.replace(/^data:image\/png;base64,/, ""),
          redacted: !bypassActive && rects.length > 0 && !redactError,
          redactedCount: bypassActive || redactError ? 0 : rects.length,
          ...(redactError ? { redactError } : {}),
        };
        break;
      }

      default: {
        const { evalEnabled } = await getState();
        result = await getContentResult(tabId, type, { ...payload, bypassActive, evalEnabled });
        break;
      }
    }

    log("debug", "comando executado com sucesso", { requestId, type });
  } catch (e) {
    ok = false;
    error = e.message ?? String(e);
    log("warn", "falha ao executar comando", { requestId, type, error });
  }

  await pushCommand({ type, ok, ts: Date.now(), error: ok ? null : error });
  notifyPopup({ event: "command", type, ok });
  updateBadge();
  sendResponse(requestId, ok, result, error);
}

async function getContentResult(tabId, action, payload) {
  await ensureContentScript(tabId);
  return new Promise((resolve, reject) => {
    browser.tabs.sendMessage(tabId, { action, payload }, (response) => {
      if (browser.runtime.lastError) {
        reject(new Error(browser.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error ?? "Erro desconhecido no content script"));
        return;
      }
      resolve(response.result ?? {});
    });
  });
}

// Injeta o content script se não estiver presente e aguarda com retry
// até o listener estar registrado antes de prosseguir
async function ensureContentScript(tabId) {
  // Tenta ping primeiro — se responder, o script já está injetado
  for (let i = 0; i < CONTENT_SCRIPT_READY_RETRIES; i++) {
    try {
      await browser.tabs.sendMessage(tabId, { action: "ping" });
      return; // script presente e responsivo
    } catch {
      if (i === 0) {
        // Primeira falha: injeta o script
        try {
          await browser.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
          log("debug", "content script injetado", { tabId });
        } catch (e) {
          throw new Error(`Não foi possível injetar content script na aba ${tabId}: ${e.message}`);
        }
      }
      // Aguarda antes de tentar o ping novamente
      await new Promise((r) => setTimeout(r, CONTENT_SCRIPT_READY_DELAY_MS));
    }
  }
  throw new Error(`Content script não respondeu após ${CONTENT_SCRIPT_READY_RETRIES} tentativas na aba ${tabId}`);
}

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      // Timeout não é falha fatal — verifica o estado final da aba
      browser.tabs.get(tabId).then(resolve).catch(reject);
    }, 10000);

    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
  });
}

async function redactScreenshot(tabId, dataUrl, rects) {
  if (!rects.length) return dataUrl;
  const [{ result }] = await browser.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (src, rectsData) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          ctx.fillStyle = "#000000";
          for (const r of rectsData) ctx.fillRect(r.x, r.y, r.width, r.height);
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => resolve(null); // sinaliza falha ao caller
        img.src = src;
      });
    },
    args: [dataUrl, rects],
  });
  if (!result) throw new Error("Falha ao renderizar canvas de redação");
  return result;
}

// ── Injeção proativa do content script ───────────────────────────────────────

async function injectIntoTab(tabId) {
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    log("debug", "content script injetado proativamente", { tabId });
  } catch {
    // Ignora: tabs de sistema (about:, moz-extension:) rejeitam injeção — comportamento esperado
  }
}

// Injeta em todas as abas já abertas ao iniciar a extensão
async function injectIntoAllTabs() {
  const tabs = await browser.tabs.query({ status: "complete" });
  for (const tab of tabs) {
    if (tab.id) await injectIntoTab(tab.id);
  }
}

// Injeta em novas abas quando terminam de carregar
browser.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "complete") injectIntoTab(tabId);
});

// ── Mensagens do popup ────────────────────────────────────────────────────────

function notifyPopup(msg) {
  browser.runtime.sendMessage({ source: "background", ...msg }).catch(() => {});
}

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.source === "popup") {
    handlePopupMessage(msg).then(sendResponse);
    return true;
  }
});

async function handlePopupMessage(msg) {
  switch (msg.action) {
    case "get_state": {
      const state = await getState();
      return { ...state, connected: ws?.readyState === WebSocket.OPEN };
    }
    case "set_port": {
      await saveState({ port: msg.port });
      ws?.close();
      return { ok: true };
    }
    case "toggle_bypass": {
      const { bypassActive } = await getState();
      await saveState({ bypassActive: !bypassActive });
      updateBadge();
      return { bypassActive: !bypassActive };
    }
    case "toggle_eval": {
      const { evalEnabled } = await getState();
      await saveState({ evalEnabled: !evalEnabled });
      return { evalEnabled: !evalEnabled };
    }
    default:
      return { ok: false, error: "Ação desconhecida" };
  }
}

// ── Keepalive ─────────────────────────────────────────────────────────────────

browser.alarms.create("keepalive", { periodInMinutes: KEEPALIVE_INTERVAL_MINUTES });
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepalive") connect();
});

// ── Init ──────────────────────────────────────────────────────────────────────

connect();
updateBadge();
injectIntoAllTabs();
