# Interface Contracts — beast-control
> date: 2026-06-10

---

## 1. Contract: Claude Code → MCP Server (stdio / JSON-RPC 2.0)

**Protocol:** MCP over stdio (JSON-RPC 2.0)
**Auth:** none (local process spawned by Claude Code)

### Exposed tools

#### `browser_ping`
```jsonc
// input
{}
// output
{ "alive": true, "version": "0.1.0" }
```

#### `browser_navigate`
```jsonc
// input
{ "url": "https://example.com" }
// output
{ "ok": true, "finalUrl": "https://example.com/redirected" }
```

#### `browser_click`
```jsonc
// input
{ "selector": "#submit-btn" }
// output
{ "ok": true }
// error
{ "ok": false, "error": "Element not found: #submit-btn" }
```

#### `browser_type`
```jsonc
// input
{ "selector": "#email", "text": "user@example.com", "clearFirst": true }
// output
{ "ok": true }
```

#### `browser_fill_form`
```jsonc
// input
{
  "fields": [
    { "selector": "#name", "value": "John" },
    { "selector": "#email", "value": "john@example.com" }
  ]
}
// output
{ "ok": true, "filled": 2, "errors": [] }
```

#### `browser_scroll`
```jsonc
// input
{ "direction": "down", "amount": 300 }
// "direction": "up" | "down" | "top" | "bottom"
// output
{ "ok": true }
```

#### `browser_screenshot`
```jsonc
// input
{}
// output
{
  "ok": true,
  "image": "<base64 PNG>",
  "redacted": true,
  "redactedCount": 2
}
```

#### `browser_get_dom`
```jsonc
// input
{ "selector": "body" }   // optional; omit = entire document
// output
{
  "ok": true,
  "html": "<html>...</html>",
  "redacted": true
}
// sensitive field text replaced by [REDACTED] when bypass=false
```

#### `browser_get_text`
```jsonc
// input
{ "selector": ".article-content" }
// output
{ "ok": true, "text": "Lorem ipsum...", "redacted": false }
```

#### `browser_eval`
```jsonc
// input
{ "expression": "document.title" }
// output
{ "ok": true, "result": "Home - Example" }
// execution error
{ "ok": false, "error": "ReferenceError: foo is not defined" }
```

### Error model (all tools)
```jsonc
{
  "ok": false,
  "error": "<human-readable message>",
  "code": "ELEMENT_NOT_FOUND" | "TIMEOUT" | "WS_DISCONNECTED" | "EXECUTION_ERROR"
}
```

---

## 2. Contract: MCP Server → Background Service Worker (WebSocket)

**Protocol:** WebSocket — `ws://127.0.0.1:7331`
**Serialization:** JSON
**Auth:** none (localhost-only)
**Timeout per command:** 30s

### Command envelope (MCP Server → Extension)
```jsonc
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",  // UUID v4
  "type": "click" | "type" | "navigate" | "scroll" | "screenshot" |
          "get_dom" | "eval_js" | "get_text" | "fill_form" | "ping",
  "payload": { /* type-specific — see below */ }
}
```

### Response envelope (Extension → MCP Server)
```jsonc
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",  // echoed from command
  "ok": true | false,
  "result": { /* type-specific */ },
  "error": "<string or null>"
}
```

### Payloads by command type

| type | payload |
|------|---------|
| `ping` | `{}` |
| `navigate` | `{ "url": string }` |
| `click` | `{ "selector": string }` |
| `type` | `{ "selector": string, "text": string, "clearFirst": boolean }` |
| `fill_form` | `{ "fields": Array<{selector, value}> }` |
| `scroll` | `{ "direction": "up"\|"down"\|"top"\|"bottom", "amount": number }` |
| `screenshot` | `{}` |
| `get_dom` | `{ "selector"?: string }` |
| `get_text` | `{ "selector": string }` |
| `eval_js` | `{ "expression": string }` |

### Result by type

| type | result |
|------|--------|
| `ping` | `{ "alive": true, "version": string }` |
| `navigate` | `{ "finalUrl": string }` |
| `click` | `{}` |
| `type` | `{}` |
| `fill_form` | `{ "filled": number, "errors": string[] }` |
| `scroll` | `{}` |
| `screenshot` | `{ "image": string (base64 PNG), "redacted": boolean, "redactedCount": number }` |
| `get_dom` | `{ "html": string, "redacted": boolean }` |
| `get_text` | `{ "text": string, "redacted": boolean }` |
| `eval_js` | `{ "result": any }` |

---

## 3. Contract: Background SW → Content Script (chrome.tabs.sendMessage)

**Protocol:** `chrome.tabs.sendMessage` (in-process, synchronous via callback)

### Messages Background → Content Script

```jsonc
// execute action
{ "action": "click" | "type" | "navigate" | "scroll" | "fill_form" | "get_dom" | "get_text" | "eval_js", "payload": {} }

// get sensitive field rects (for screenshot)
{ "action": "get_sensitive_rects" }

// check bypass state
{ "action": "get_bypass_state" }
```

### Response Content Script → Background
```jsonc
{ "ok": boolean, "result": any, "error": string | null }
```

---

## 4. Contract: Popup UI → Background SW (chrome.runtime.sendMessage)

**Protocol:** `chrome.runtime.sendMessage`

```jsonc
// popup → background: read current state
{ "action": "get_state" }
// background → popup: response
{
  "connected": boolean,
  "port": number,
  "bypassActive": boolean,
  "recentCommands": [
    { "type": string, "ok": boolean, "ts": number }
  ]   // last 5
}

// popup → background: change port
{ "action": "set_port", "port": 7331 }

// popup → background: toggle bypass
{ "action": "toggle_bypass" }
// background → popup: response
{ "bypassActive": boolean }
```

---

## 5. Redaction rules

Fields that **always** trigger redaction (unless bypass is active):

| CSS Selector | Reason |
|-------------|--------|
| `[type="password"]` | Password |
| `[type="tel"]` | Phone / personal data |
| `[autocomplete~="cc-number"]` | Card number |
| `[autocomplete~="cc-csc"]` | CVV |
| `[name*="card" i]` | Generic card field |
| `[name*="cvv" i]` | Generic CVV |
| `[name*="ssn" i]` | Social Security Number |
| `[name*="cpf" i]` | Brazilian tax ID (CPF) |
| `[name*="password" i]` | Generic password |

**Redaction behavior:**
- `get_text` / `get_dom`: value replaced with `[REDACTED]`
- `screenshot`: element bounding box painted black (`#000`) on the canvas before exporting base64
- `fill_form` / `type` sent **to** the browser: no redaction (Claude is sending data, not receiving it)
