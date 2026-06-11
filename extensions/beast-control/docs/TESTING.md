# Estratégia de Testes — beast-control

## Pirâmide

```
       /\
      /  \   E2E — fora do escopo automatizado
     /----\          (testes manuais via MCP tools)
    /      \
   / Integr \  handshake WebSocket completo
  /----------\
 /   Unit     \  redação, sanitização, seletores
/--------------\
```

**Justificativa por nível:**

| Nível | Ferramenta | O que cobre | Por que esta escolha |
|-------|-----------|------------|----------------------|
| Unit | `node:test` + `tsx` | `sanitizeError`, lógica de `isSensitive`, serialização | Sem browser, sem rede — rápido e determinístico |
| Integration | `node:test` + WebSocket real | Handshake token HTTP + autenticação WS | Testa o contrato de segurança SEC-001 de ponta a ponta |
| E2E | Manual via MCP tools | Navegação, screenshots, multi-tab | Requer browser real; coberto em sessão de desenvolvimento |

## Arquivos de teste

| Arquivo | Tipo | O que testa |
|---------|------|------------|
| `src/bridge.test.ts` | Unit | `sanitizeError` — normalização de erros (SEC-009) |
| `src/handshake.test.ts` | Integration | Token endpoint one-shot + rejeição de clientes não autenticados (SEC-001) |
| `src/redaction.test.ts` | Unit | `isSensitive` — seletores de campos sensíveis; `sanitizeError` inline |

## Rodar os testes

```bash
cd mcp-server
npm test          # roda todos os testes
npm run typecheck # verifica tipos sem compilar
```

## Política de cobertura

- Toda lógica de segurança (redação, handshake, sanitização) deve ter cobertura explícita
- Não há floor numérico — o critério é: cada decisão de segurança tem pelo menos um teste de happy path e um de falha
- Código de wiring (registro de tools MCP, `main()`) fica fora da cobertura automatizada

## Política de flakiness

- Testes com timeout (ex: `handshake.test.ts` testa rejeição por timeout em 500ms) são aceitáveis desde que o timeout seja controlável por parâmetro
- Qualquer teste que falhe de forma intermitente deve ser corrigido ou deletado na mesma sprint

## CI gate (quando aplicável)

```
npm run typecheck  # < 5s
npm test           # < 30s
```
