# Component Diagram — beast-control
> date: 2026-06-10

## Visão geral do sistema

```mermaid
flowchart TD
    subgraph USER["Usuário"]
        U[("Usuário\n(baixo nível técnico)")]
    end

    subgraph CLAUDE_CODE["Claude Code (processo)"]
        CC["Claude Code\n(LLM + harness)"]
        MCP["MCP Server\n(beast-control-mcp)\nNode.js / stdio"]
        WSS["WebSocket Server\nws://127.0.0.1:7331"]
        CC <-->|"MCP tools via stdio\n(JSON-RPC)"| MCP
        MCP <-->|"in-process"| WSS
    end

    subgraph ZEN["Zen Browser (processo)"]
        BG["Background\nService Worker\n(WebSocket client)"]
        CS["Content Script\n(DOM executor +\nredação de campos)"]
        POP["Popup UI\n(status + toggle bypass)"]
        BG <-->|"chrome.tabs.sendMessage"| CS
        BG <-->|"chrome.runtime.sendMessage"| POP
        POP <-->|"browser.storage.local"| BG
    end

    subgraph PAGE["Página web ativa"]
        DOM["DOM da página"]
    end

    U -->|"digita pedido em linguagem natural"| CC
    U -->|"abre popup / ativa bypass"| POP

    WSS <-->|"WebSocket\nws://127.0.0.1:7331\nJSON commands + responses"| BG
    CS <-->|"injeta scripts /\nexecuta ações DOM"| DOM

    style USER fill:#f5f5f5,stroke:#999
    style CLAUDE_CODE fill:#e8f4fd,stroke:#2196F3
    style ZEN fill:#fdf3e8,stroke:#FF9800
    style PAGE fill:#f0f4e8,stroke:#8BC34A
```

## Fluxo de um comando (ex: `browser_click`)

```mermaid
sequenceDiagram
    participant CC as Claude Code
    participant MCP as MCP Server
    participant WSS as WS Server (127.0.0.1:7331)
    participant BG as Background SW
    participant CS as Content Script
    participant DOM as DOM da Página

    CC->>MCP: tool call browser_click({selector: "#btn"})
    MCP->>MCP: gera requestId (UUID)
    MCP->>WSS: enfileira mensagem
    WSS->>BG: JSON {type:"click", selector:"#btn", requestId:"..."}
    BG->>CS: chrome.tabs.sendMessage({action:"click", selector:"#btn"})
    CS->>DOM: document.querySelector("#btn").click()
    DOM-->>CS: resultado
    CS-->>BG: {ok: true}
    BG-->>WSS: JSON {requestId:"...", ok:true}
    WSS-->>MCP: resolve promise por requestId
    MCP-->>CC: tool result {ok: true}
```

## Fluxo de screenshot com redação

```mermaid
sequenceDiagram
    participant MCP as MCP Server
    participant BG as Background SW
    participant CS as Content Script

    MCP->>BG: {type:"screenshot", requestId:"..."}
    BG->>CS: {action:"get_sensitive_rects"}
    CS->>CS: busca campos sensíveis no DOM
    CS-->>BG: [{x,y,w,h}, ...]
    BG->>BG: chrome.tabs.captureVisibleTab() → base64
    BG->>BG: verifica bypass no storage.local
    alt bypass=false
        BG->>BG: pinta retângulos pretos sobre base64
    end
    BG-->>MCP: {requestId:"...", image: base64, redacted: true/false}
```

## Estados do badge da extensão

```mermaid
stateDiagram-v2
    [*] --> Desconectado
    Desconectado --> Conectado: WebSocket conecta
    Conectado --> Desconectado: conexão cai / servidor offline
    Conectado --> BypassAtivo: usuário ativa toggle
    BypassAtivo --> Conectado: usuário desativa toggle
    BypassAtivo --> Desconectado: conexão cai

    note right of Desconectado: badge cinza
    note right of Conectado: badge verde
    note right of BypassAtivo: badge vermelho + ícone ⚠️
```
