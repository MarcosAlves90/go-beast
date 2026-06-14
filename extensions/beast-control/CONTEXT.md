# Context — beast-control

## What this project is

**beast-control** is an optional tool in the go-* pack: a Firefox/Zen extension + Node.js MCP server that exposes real browser control as tools for Claude Code.

Registered as the MCP tool `beast-control`, it is used by the beasts go-lynx, go-eagle, and go-bear when they need to interact with the user's browser — authenticated pages, real session state, UI inspection. When unavailable, the beasts fall back to Playwright.

## Canonical terminology

| Term | Meaning |
|-------|------------|
| **extension** | The Firefox (MV3) extension running in Zen Browser |
| **background** | The extension's service worker (`extension/background.js`) |
| **content script** | The script injected into pages to execute DOM actions (`extension/content.js`) |
| **bridge** | The WebSocket server in the MCP server (`mcp-server/src/bridge.ts`) |
| **MCP server** | The Node.js process spawned by Claude Code via stdio |
| **handshake** | The one-shot token authentication protocol (SEC-001) |
| **redaction** | Replacing sensitive field values with `[REDACTED]` |
| **bypass** | Mode that disables redaction — activated manually in the popup |
| **eval** | Execution of arbitrary JS via `browser_eval` — disabled by default |

## Architecture in one line

```
Claude Code → MCP server (stdio) → WebSocket 127.0.0.1:7331 → background SW → content script → DOM
```

## Position in the go-* pack

Optional tool — not a phase beast. Documented in the global CLAUDE.md as MCP tool `beast-control`. Beasts that use it when available: go-lynx, go-eagle, go-bear.

## Decisions already made (do not reopen without evidence)

- MV3 with service worker (not MV2) — see ADR-001
- WebSocket as bridge protocol (not Native Messaging) — see ADR-002
- MCP via stdio (not HTTP daemon) — see ADR-003
- Redaction in the content script, not in the MCP server — see ADR-004
- One-shot token via HTTP (not file, not Native Messaging) — see docs/security/SECURITY_REVIEW.md SEC-001
