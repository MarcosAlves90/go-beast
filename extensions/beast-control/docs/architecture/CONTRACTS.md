# Interface Contracts — beast-control
> date: 2026-06-10

---

## 1. Contrato: Claude Code → MCP Server (stdio / JSON-RPC 2.0)

**Protocolo:** MCP sobre stdio (JSON-RPC 2.0)
**Auth:** nenhuma (processo local spawned pelo Claude Code)

### Tools expostas

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
// erro
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
    { "selector": "#name", "value": "João" },
    { "selector": "#email", "value": "joao@example.com" }
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
{ "selector": "body" }   // opcional; omitir = documento inteiro
// output
{
  "ok": true,
  "html": "<html>...</html>",
  "redacted": true
}
// texto de campos sensíveis substituído por [REDACTED] quando bypass=false
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
// erro de execução
{ "ok": false, "error": "ReferenceError: foo is not defined" }
```

### Modelo de erro (todas as tools)
```jsonc
{
  "ok": false,
  "error": "<mensagem legível>",
  "code": "ELEMENT_NOT_FOUND" | "TIMEOUT" | "WS_DISCONNECTED" | "EXECUTION_ERROR"
}
```

---

## 2. Contrato: MCP Server → Background Service Worker (WebSocket)

**Protocolo:** WebSocket — `ws://127.0.0.1:7331`
**Serialização:** JSON
**Auth:** nenhuma (localhost-only)
**Timeout por comando:** 30s

### Envelope de comando (MCP Server → Extensão)
```jsonc
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",  // UUID v4
  "type": "click" | "type" | "navigate" | "scroll" | "screenshot" |
          "get_dom" | "eval_js" | "get_text" | "fill_form" | "ping",
  "payload": { /* específico por tipo — ver abaixo */ }
}
```

### Envelope de resposta (Extensão → MCP Server)
```jsonc
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",  // eco do comando
  "ok": true | false,
  "result": { /* específico por tipo */ },
  "error": "<string ou null>"
}
```

### Payloads por tipo de comando

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

### Resultado por tipo

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

## 3. Contrato: Background SW → Content Script (chrome.tabs.sendMessage)

**Protocolo:** `chrome.tabs.sendMessage` (intra-processo, síncrono via callback)

### Mensagens Background → Content Script

```jsonc
// executar ação
{ "action": "click" | "type" | "navigate" | "scroll" | "fill_form" | "get_dom" | "get_text" | "eval_js", "payload": {} }

// obter rects de campos sensíveis (para screenshot)
{ "action": "get_sensitive_rects" }

// verificar estado de bypass
{ "action": "get_bypass_state" }
```

### Resposta Content Script → Background
```jsonc
{ "ok": boolean, "result": any, "error": string | null }
```

---

## 4. Contrato: Popup UI → Background SW (chrome.runtime.sendMessage)

**Protocolo:** `chrome.runtime.sendMessage`

```jsonc
// popup → background: ler estado atual
{ "action": "get_state" }
// background → popup: resposta
{
  "connected": boolean,
  "port": number,
  "bypassActive": boolean,
  "recentCommands": [
    { "type": string, "ok": boolean, "ts": number }
  ]   // últimos 5
}

// popup → background: alterar porta
{ "action": "set_port", "port": 7331 }

// popup → background: alternar bypass
{ "action": "toggle_bypass" }
// background → popup: resposta
{ "bypassActive": boolean }
```

---

## 5. Regras de redação

Campos que **sempre** disparam redação (salvo bypass ativo):

| Seletor CSS | Motivo |
|-------------|--------|
| `[type="password"]` | Senha |
| `[type="tel"]` | Telefone / dados pessoais |
| `[autocomplete~="cc-number"]` | Número de cartão |
| `[autocomplete~="cc-csc"]` | CVV |
| `[name*="card" i]` | Campo de cartão genérico |
| `[name*="cvv" i]` | CVV genérico |
| `[name*="ssn" i]` | Social Security Number |
| `[name*="cpf" i]` | CPF brasileiro |
| `[name*="password" i]` | Senha genérica |

**Comportamento de redação:**
- `get_text` / `get_dom`: valor substituído por `[REDACTED]`
- `screenshot`: bounding box do elemento pintado de preto (`#000`) sobre o canvas antes de exportar base64
- `fill_form` / `type` enviados **ao** browser: sem redação (Claude está enviando dados, não recebendo)
