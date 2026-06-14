# Threat Model — beast-control
> date: 2026-06-10

## Assets to protect

| Asset | Description | Impact if compromised |
|-------|-----------|------------------------|
| Content of open pages | DOM, text, screenshots of active tabs | Exposure of personal data, passwords, banking sessions |
| Sensitive fields in the DOM | Passwords, tax IDs, credit card numbers, CVV | Theft of credentials and financial data |
| Authenticated sessions | Cookies and tokens maintained by the browser | Account hijacking |
| Arbitrary JS execution | `eval_js` executes code in the page context | Persistent XSS, cookie theft, page state modification |
| Local WebSocket port | `ws://127.0.0.1:7331` accepts any local connection | Any local process can send commands to the browser |

## Threat actors

| Actor | Motivation | Capability |
|------|-----------|-----------|
| Malicious web page | Execute actions in the user's browser | DNS rebinding, referencing 127.0.0.1 via JavaScript |
| Malicious local process | Exfiltrate data or execute actions | Direct connection to WebSocket at 127.0.0.1:7331 |
| Malicious third-party extension | Intercept extension messages | `chrome.runtime.sendMessage` to another extension ID |
| Claude (LLM prompt injection) | Page with malicious instructions in returned data | Prompt injection via `get_dom` / `get_text` that instructs the LLM to execute `eval_js` |

## Attack surfaces

1. **WebSocket at 127.0.0.1:7331** — any local process (and pages via DNS rebinding) can connect without authentication
2. **`eval_js` / `new Function()`** — arbitrary code execution in the active page context
3. **`browser_navigate` with arbitrary URL** — can navigate to `file://`, `about:`, or other dangerous schemes
4. **Client-side redaction** — relies on CSS selector heuristics; sensitive fields not covered may leak
5. **Command log in popup** — displays type and status, but not content; low risk
6. **`bypassActive` in `browser.storage.local`** — state read by the content script; modifiable by other extensions with `storage` permission

## Impact of a breach

- **DNS rebinding + eval_js**: a malicious page achieves arbitrary code execution in the victim's browser, access to session cookies, exfiltration of data from the active page
- **Malicious local process**: full browser control via WebSocket without authentication
- **Prompt injection**: data returned by `get_dom`/`get_text` from a malicious page instructs the LLM to perform unauthorized actions
