# beast-control

> Ferramenta opcional do pacote **go-****

Extensão para o Zen Browser que deixa o Claude Code controlar o browser por você — clicar em botões, preencher formulários, tirar screenshots, extrair texto, navegar entre páginas.

Funciona como uma ponte: o Claude Code fala com um servidor local, o servidor fala com a extensão, a extensão executa a ação no browser.

---

## O que você precisa

- [Zen Browser](https://zen-browser.app) instalado
- [Node.js](https://nodejs.org) versão 20 ou superior (`node --version` deve mostrar `v20` ou maior)
- [Claude Code](https://claude.ai/code) instalado

---

## Instalação (uma vez só)

**1. Instalar a extensão no Zen Browser**

1. Abra o Zen Browser
2. Digite `about:debugging` na barra de endereço e pressione Enter
3. Clique em **"Este Firefox"** no menu à esquerda
4. Clique em **"Carregar extensão temporária..."**
5. Navegue até a pasta `beast-control/extension/` e selecione `manifest.json`

O ícone do beast-control aparece na barra de ferramentas. Você vai precisar repetir esses passos toda vez que reiniciar o Zen Browser.

**2. Instalar o servidor MCP**

```bash
cd /Users/marcos.lopes/Documents/@cherry-c/go-beast/extensions/beast-control/mcp-server
npm install
npm run build
```

**3. Registrar no Claude Code**

Crie ou edite `~/.claude/claude.json` e adicione dentro de `"mcpServers"`:

```json
{
  "mcpServers": {
    "beast-control": {
      "command": "node",
      "args": ["/Users/marcos.lopes/Documents/@cherry-c/go-beast/extensions/beast-control/mcp-server/dist/index.js"],
      "env": {
        "BEAST_CONTROL_PORT": "7331"
      }
    }
  }
}
```

---

## Uso

1. Abra o Zen Browser com a extensão carregada
2. Abra o Claude Code — o servidor MCP sobe automaticamente
3. O ícone da extensão fica **verde** quando a conexão está ativa
4. Peça ao Claude o que quiser: *"clique no botão de enviar"*, *"preencha o campo de e-mail com x@exemplo.com"*, *"tire um screenshot da página"*

### Comandos disponíveis para o Claude

| Comando | O que faz |
|---------|-----------|
| `browser_ping` | Verifica se a extensão está conectada |
| `browser_navigate` | Navega para uma URL |
| `browser_click` | Clica em um elemento |
| `browser_type` | Digita texto em um campo |
| `browser_fill_form` | Preenche vários campos de uma vez |
| `browser_scroll` | Rola a página |
| `browser_screenshot` | Tira um screenshot da aba ativa |
| `browser_get_dom` | Obtém o HTML da página |
| `browser_get_text` | Extrai o texto visível |
| `browser_eval` | Executa JavaScript na página (desabilitado por padrão) |

---

## Privacidade

Por padrão, campos de **senha, CPF, cartão de crédito e CVV** são ocultados antes de qualquer informação chegar ao Claude. Screenshots também têm essas áreas pintadas de preto.

**Para desativar temporariamente:** clique no ícone da extensão e ative o toggle "Bypass de privacidade". O ícone fica vermelho enquanto estiver ativo.

**Para habilitar execução de JS (`browser_eval`):** ative o toggle "Permitir execução de JS" no popup. Desative quando não precisar.

---

## Solução de problemas

| Sintoma | O que fazer |
|---------|-------------|
| Ícone cinza (desconectado) | Confirme que o Claude Code está aberto; verifique se a porta no popup bate com `BEAST_CONTROL_PORT` (padrão: 7331) |
| "Extensão beast-control não conectada" no Claude | Recarregue a extensão em `about:debugging`; reinicie o Claude Code |
| Porta em uso | Mude `BEAST_CONTROL_PORT` no `claude.json` e atualize a porta no popup da extensão |
| Extensão sumiu após reiniciar o Zen | Recarregue via `about:debugging` → Carregar extensão temporária |

---

## Documentação técnica

- [Instalação detalhada](docs/SETUP.md)
- [Arquitetura e decisões técnicas](docs/architecture/ADR.md)
- [Contratos de interface](docs/architecture/CONTRACTS.md)
- [Revisão de segurança](docs/security/SECURITY_REVIEW.md)
- [Estratégia de testes](docs/TESTING.md)

## Integração com o pacote go-*

beast-control é registrado como MCP tool opcional no Claude Code. Os beasts do pacote go-* podem usar as tools `browser_*` quando o Zen Browser estiver aberto com a extensão ativa — go-lynx para verificar UI, go-eagle para testes E2E, go-bear para inspecionar headers de segurança.

Se o beast-control não estiver conectado, os beasts caem de volta para o Playwright.
