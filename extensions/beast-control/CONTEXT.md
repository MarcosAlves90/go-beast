# Context — beast-control

## O que é este projeto

**beast-control** é uma ferramenta opcional do pacote go-*: uma extensão Firefox/Zen + servidor MCP Node.js que expõe controle do browser real como ferramentas para Claude Code.

Registrado como MCP tool `beast-control`, é usado pelos beasts go-lynx, go-eagle e go-bear quando precisam interagir com o browser do usuário — páginas autenticadas, estado real de sessão, inspeção de UI. Quando não está disponível, os beasts usam Playwright como fallback.

## Terminologia canônica

| Termo | Significado |
|-------|------------|
| **extensão** | A extensão Firefox (MV3) que roda no Zen Browser |
| **background** | O service worker da extensão (`extension/background.js`) |
| **content script** | O script injetado nas páginas para executar ações DOM (`extension/content.js`) |
| **bridge** | O WebSocket server no MCP server (`mcp-server/src/bridge.ts`) |
| **MCP server** | O processo Node.js spawned pelo Claude Code via stdio |
| **handshake** | O protocolo de autenticação por token one-shot (SEC-001) |
| **redação** | Substituição de valores de campos sensíveis por `[REDACTED]` |
| **bypass** | Modo que desativa a redação — ativado manualmente no popup |
| **eval** | Execução de JS arbitrário via `browser_eval` — desabilitado por padrão |

## Arquitetura em uma linha

```
Claude Code → MCP server (stdio) → WebSocket 127.0.0.1:7331 → background SW → content script → DOM
```

## Posição no pacote go-*

Ferramenta opcional — não é um beast de fase. Documentada no CLAUDE.md global como MCP tool `beast-control`. Beasts que a usam quando disponível: go-lynx, go-eagle, go-bear.

## Decisões já tomadas (não reabrir sem evidência)

- MV3 com service worker (não MV2) — veja ADR-001
- WebSocket como protocolo de bridge (não Native Messaging) — veja ADR-002
- MCP via stdio (não daemon HTTP) — veja ADR-003
- Redação no content script, não no MCP server — veja ADR-004
- Token one-shot via HTTP (não arquivo, não Native Messaging) — veja docs/security/SECURITY_REVIEW.md SEC-001
