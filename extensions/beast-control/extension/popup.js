const statusIndicator = document.getElementById("status-indicator");
const statusLabel     = document.getElementById("status-label");
const portInput       = document.getElementById("port-input");
const portSave        = document.getElementById("port-save");
const bypassToggle    = document.getElementById("bypass-toggle");
const bypassSection   = document.getElementById("bypass-section");
const bypassWarning   = document.getElementById("bypass-warning");
const evalToggle      = document.getElementById("eval-toggle");
const evalWarning     = document.getElementById("eval-warning");
const commandLog      = document.getElementById("command-log");

function send(msg) {
  return new Promise((resolve) => {
    browser.runtime.sendMessage({ source: "popup", ...msg }, resolve);
  });
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("pt-BR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function renderState({ connected, bypassActive, evalEnabled, port, recentCommands }) {
  // Status indicator
  statusIndicator.className = "status-indicator";
  if (bypassActive) {
    statusIndicator.classList.add("status--bypass");
    statusLabel.textContent = "Bypass ativo";
  } else if (connected) {
    statusIndicator.classList.add("status--connected");
    statusLabel.textContent = "Conectado";
  } else {
    statusIndicator.classList.add("status--disconnected");
    statusLabel.textContent = "Desconectado";
  }

  portInput.value = port;

  bypassToggle.checked = bypassActive;
  bypassWarning.hidden = !bypassActive;
  bypassSection.classList.toggle("bypass--active", bypassActive);

  evalToggle.checked = evalEnabled;
  evalWarning.hidden = !evalEnabled;

  if (!recentCommands.length) {
    commandLog.innerHTML = '<li class="empty">Nenhum comando ainda</li>';
    return;
  }

  commandLog.innerHTML = recentCommands.map(({ type, ok, ts, error }) => {
    const name = type.replace(/_/g, "_​"); // zero-width space para quebra suave
    const statusClass = ok ? "cmd-status--ok" : "cmd-status--fail";
    const statusText  = ok ? "ok" : "erro";
    const title = error ? ` title="${error.slice(0, 140).replace(/"/g, "&quot;")}"` : "";
    return `<li${title}>
      <span class="cmd-name">${name}</span>
      <span class="cmd-status ${statusClass}">${statusText}</span>
      <span class="cmd-time">${formatTime(ts)}</span>
    </li>`;
  }).join("");
}

async function init() {
  const state = await send({ action: "get_state" });
  renderState(state);
}

portSave.addEventListener("click", async () => {
  const port = parseInt(portInput.value, 10);
  if (port < 1024 || port > 65535) return;
  await send({ action: "set_port", port });
  portSave.textContent = "Salvo!";
  portSave.style.background = "var(--green)";
  setTimeout(() => {
    portSave.textContent = "Salvar";
    portSave.style.background = "";
  }, 1500);
});

bypassToggle.addEventListener("change", async () => {
  const { bypassActive } = await send({ action: "toggle_bypass" });
  bypassWarning.hidden = !bypassActive;
  bypassSection.classList.toggle("bypass--active", bypassActive);
  statusIndicator.className = "status-indicator " +
    (bypassActive ? "status--bypass" : (bypassToggle.checked ? "status--connected" : "status--disconnected"));
});

evalToggle.addEventListener("change", async () => {
  const { evalEnabled } = await send({ action: "toggle_eval" });
  evalWarning.hidden = !evalEnabled;
});

browser.runtime.onMessage.addListener(async (msg) => {
  if (msg.source !== "background") return;
  const state = await send({ action: "get_state" });
  renderState(state);
});

init();
