// Selectors for fields considered sensitive by default
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

function isSensitive(el) {
  return SENSITIVE_SELECTORS.some((sel) => el.matches(sel));
}

function redactText(el, text) {
  return isSensitive(el) ? "[REDACTED]" : text;
}

function getSensitiveRects() {
  const rects = [];
  for (const sel of SENSITIVE_SELECTORS) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        rects.push({
          x: Math.floor(r.left + window.scrollX),
          y: Math.floor(r.top + window.scrollY),
          width: Math.ceil(r.width),
          height: Math.ceil(r.height),
        });
      }
    }
  }
  return rects;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

const handlers = {
  ping() {
    return { ok: true, result: { alive: true } };
  },

  click({ selector }) {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, error: `Element not found: ${selector}` };
    el.click();
    return { ok: true, result: {} };
  },

  type({ selector, text, clearFirst }) {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, error: `Element not found: ${selector}` };
    el.focus();
    if (clearFirst) el.value = "";
    el.value += text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, result: {} };
  },

  fill_form({ fields }) {
    const errors = [];
    let filled = 0;
    for (const { selector, value } of fields) {
      const el = document.querySelector(selector);
      if (!el) { errors.push(`Element not found: ${selector}`); continue; }
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      filled++;
    }
    return { ok: errors.length === 0, result: { filled, errors } };
  },

  scroll({ direction, amount }) {
    const scrollMap = {
      down: () => window.scrollBy(0, amount ?? 300),
      up: () => window.scrollBy(0, -(amount ?? 300)),
      top: () => window.scrollTo(0, 0),
      bottom: () => window.scrollTo(0, document.body.scrollHeight),
    };
    (scrollMap[direction] ?? scrollMap.down)();
    return { ok: true, result: {} };
  },

  get_dom({ selector, bypassActive }) {
    const root = selector ? document.querySelector(selector) : document.documentElement;
    if (!root) return { ok: false, error: `Element not found: ${selector}` };

    let html = root.outerHTML;
    let redacted = false;

    if (!bypassActive) {
      const tmp = root.cloneNode(true);
      for (const sel of SENSITIVE_SELECTORS) {
        for (const el of tmp.querySelectorAll(sel)) {
          el.value = "[REDACTED]";
          el.setAttribute("value", "[REDACTED]");
          el.textContent = "";
        }
      }
      const afterHtml = tmp.outerHTML;
      redacted = afterHtml !== html;
      html = afterHtml;
    }

    return { ok: true, result: { html, redacted } };
  },

  get_text({ selector, bypassActive }) {
    const el = selector ? document.querySelector(selector) : document.body;
    if (!el) return { ok: false, error: `Element not found: ${selector}` };
    const raw = el.innerText ?? el.textContent ?? "";
    const redacted = !bypassActive && isSensitive(el);
    return { ok: true, result: { text: redacted ? "[REDACTED]" : raw, redacted } };
  },

  eval_js({ expression, evalEnabled }) {
    // SEC-003: eval_js disabled by default; requires explicit flag in storage
    if (!evalEnabled) {
      return {
        ok: false,
        error: "eval_js is disabled. Enable 'Allow JS execution' in the extension popup to use this command.",
      };
    }
    try {
      // eslint-disable-next-line no-new-func
      const result = new Function(`return (${expression})`)();
      return { ok: true, result: { result } };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  get_sensitive_rects() {
    return { ok: true, result: getSensitiveRects() };
  },
};

// ── Listener ──────────────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg.action];
  if (!handler) {
    sendResponse({ ok: false, error: `Unknown action: ${msg.action}` });
    return;
  }
  try {
    const response = handler(msg.payload ?? {});
    sendResponse(response);
  } catch (e) {
    sendResponse({ ok: false, error: e.message ?? String(e) });
  }
});
