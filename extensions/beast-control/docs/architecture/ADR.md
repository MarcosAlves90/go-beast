# Architecture Decision Records — beast-control
> date: 2026-06-10

---

## ADR-001: Manifest V3 como base da extensão
**Status:** Accepted  **Date:** 2026-06-10

### Context
Zen Browser 1.20.2b roda sobre Firefox/Gecko 151. O Firefox implementou suporte completo a MV3 a partir do Firefox 127. MV2 ainda funciona mas está em deprecação ativa pela Mozilla.

### Decision
Usar Manifest V3 com Service Worker como background script.

### Consequences
- `eval_js` usa `chrome.scripting.executeScript` com `world: "MAIN"` para acesso ao contexto da página
- Service worker pode ser terminado pelo browser; o background deve reconectar o WebSocket via `chrome.alarms` (keepalive a cada 25s)
- Permissões necessárias: `scripting`, `activeTab`, `storage`, `tabs`
- A permissão `<all_urls>` é necessária para `scripting.executeScript` funcionar em qualquer página

### Alternatives considered
- **MV2:** Funciona hoje, mas seria escolher tecnologia morta; background persistente seria mais simples para WebSocket, mas não justifica a dívida técnica

---

## ADR-002: WebSocket como protocolo de bridge entre MCP server e extensão
**Status:** Accepted  **Date:** 2026-06-10

### Context
A extensão Firefox não pode ser chamada diretamente via HTTP ou Native Messaging sem instalação de um host nativo separado. O WebSocket iniciado pela extensão (cliente) conectando a um servidor local (MCP server) inverte esse problema: a extensão puxa a conexão, sem necessidade de permissões extras de sistema.

### Decision
A extensão age como **cliente WebSocket**; o MCP server age como **servidor WebSocket** em `ws://127.0.0.1:7331`.

### Consequences
- Bind exclusivo em `127.0.0.1` — inacessível via rede externa
- A extensão deve reconectar com backoff exponencial (máx 30s) quando o servidor não está disponível
- O MCP server deve iniciar o WebSocket server imediatamente ao ser spawned pelo Claude Code via stdio
- Sem autenticação de WebSocket (tráfego localhost-only, requisito explícito)

### Alternatives considered
- **Native Messaging:** Mais seguro (comunicação direta sem porta de rede), mas requer instalação de um host nativo (.json em diretório do sistema) — alto atrito para usuário não-técnico
- **HTTP polling:** Mais simples mas introduz latência e complexidade de estado; WebSocket é bidirecional por natureza

---

## ADR-003: MCP server via stdio (on-demand)
**Status:** Accepted  **Date:** 2026-06-10

### Context
O SDK MCP suporta dois transportes: stdio (Claude Code spawna o processo) e HTTP/SSE (daemon persistente). Para uso local sem instalação de daemon, stdio é o caminho de menor atrito.

### Decision
O MCP server usa transporte **stdio**. Claude Code o spawna a cada sessão via configuração em `~/.claude/claude.json` ou `.mcp.json` no projeto.

### Consequences
- O WebSocket server (porta 7331) sobe junto com o processo MCP e desce quando Claude Code termina a sessão
- Sem gerenciamento de daemon pelo usuário — sem `pm2`, `launchd`, ou `systemd`
- Se a extensão estava conectada e o MCP server reinicia, a extensão reconecta automaticamente (ADR-002)

### Alternatives considered
- **Daemon persistente (HTTP/SSE):** Melhor para múltiplas sessões simultâneas; desnecessário para uso single-user local

---

## ADR-004: Redação de campos sensíveis no content script (não no MCP server)
**Status:** Accepted  **Date:** 2026-06-10

### Context
A redação pode ocorrer em dois pontos: no content script (antes de sair do browser) ou no MCP server (antes de chegar ao Claude). Redagir no content script garante que dados sensíveis nunca saem do processo do browser.

### Decision
Toda redação de texto e pintura de screenshots acontece no **content script**, antes de qualquer transmissão via WebSocket.

### Consequences
- O content script mantém uma lista de seletores sensíveis: `[type=password]`, `[type=tel]`, `[autocomplete~=cc-number]`, `[name*=card]`, `[name*=cvv]`, `[name*=ssn]`, `[name*=cpf]`
- Para screenshots: o content script localiza os bounding boxes dos campos sensíveis, os serializa junto com a imagem; o MCP server pinta os retângulos em preto sobre o base64 antes de retornar ao Claude
- O toggle de bypass (F-08) é lido do `browser.storage.local` pelo content script; quando ativo, nenhuma redação é aplicada

### Alternatives considered
- **Redação no MCP server:** Os dados já saíram do browser — não elimina o risco de exposição em memória ou logs do processo Node
- **Redação no background script:** O background não tem acesso direto ao DOM; delegaria ao content script de qualquer forma

---

## ADR-005: Identificação de comandos por `requestId` único
**Status:** Accepted  **Date:** 2026-06-10

### Context
O WebSocket é full-duplex. O MCP server pode enviar múltiplos comandos antes de receber respostas. Sem identificador de correlação, respostas fora de ordem não têm destinatário.

### Decision
Todo comando carrega um `requestId` (UUID v4 gerado pelo MCP server). A extensão ecoa o mesmo `requestId` na resposta. O MCP server usa um Map de promises pendentes keyed por `requestId`, com timeout de 30s.

### Consequences
- Timeout de 30s por comando — após isso, a promise rejeita com erro de timeout
- Máximo de 1 comando em voo por vez não é necessário — o protocolo suporta concorrência (mas o Claude Code tipicamente envia um comando por vez)
- `requestId` nunca é reusado na mesma sessão

### Alternatives considered
- **Fila sequencial (um comando por vez):** Mais simples, sem necessidade de correlação, mas bloqueia o MCP server enquanto o browser executa — prejudica latência percebida
