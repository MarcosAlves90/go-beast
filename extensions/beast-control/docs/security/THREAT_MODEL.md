# Threat Model — beast-control
> date: 2026-06-10

## Ativos a proteger

| Ativo | Descrição | Impacto se comprometido |
|-------|-----------|------------------------|
| Conteúdo das páginas abertas | DOM, texto, screenshots das abas ativas | Exposição de dados pessoais, senhas, sessões bancárias |
| Campos sensíveis no DOM | Senhas, CPF, cartão de crédito, CVV | Roubo de credenciais e dados financeiros |
| Sessões autenticadas | Cookies e tokens mantidos pelo browser | Sequestro de conta |
| Execução arbitrária de JS | `eval_js` executa código no contexto da página | XSS persistente, roubo de cookies, modificação de estado da página |
| Porta WebSocket local | `ws://127.0.0.1:7331` aceita qualquer conexão local | Qualquer processo local pode enviar comandos ao browser |

## Atores de ameaça

| Ator | Motivação | Capacidade |
|------|-----------|-----------|
| Página web maliciosa | Executar ações no browser do usuário | DNS rebinding, referência a 127.0.0.1 via JavaScript |
| Processo local malicioso | Exfiltrar dados ou executar ações | Conexão direta ao WebSocket em 127.0.0.1:7331 |
| Extensão terceira maliciosa | Interceptar mensagens da extensão | `chrome.runtime.sendMessage` para outro ID de extensão |
| Claude (LLM prompt injection) | Página com instruções maliciosas nos dados retornados | Prompt injection via `get_dom` / `get_text` que instrui o LLM a executar `eval_js` |

## Superfícies de ataque

1. **WebSocket em 127.0.0.1:7331** — qualquer processo local (e páginas via DNS rebinding) pode conectar sem autenticação
2. **`eval_js` / `new Function()`** — execução arbitrária de código no contexto da página ativa
3. **`browser_navigate` com URL arbitrária** — pode navegar para `file://`, `about:`, ou outros esquemas perigosos
4. **Redação client-side** — depende de heurístico de seletor CSS; campos sensíveis não cobertos vazam
5. **Log de comandos no popup** — exibe tipo e status, mas não conteúdo; risco baixo
6. **`bypassActive` em `browser.storage.local`** — estado lido pelo content script; modificável por outras extensões com permissão `storage`

## Impacto de uma brecha

- **DNS rebinding + eval_js**: página maliciosa consegue execução arbitrária de código no browser da vítima, acesso a cookies de sessão, exfiltração de dados da página ativa
- **Processo local mal-intencionado**: controle total do browser via WebSocket sem autenticação
- **Prompt injection**: dados retornados pelo `get_dom`/`get_text` de uma página maliciosa instruem o LLM a executar ações não autorizadas
