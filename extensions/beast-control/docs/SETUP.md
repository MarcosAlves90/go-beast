# Instalação do beast-control

O beast-control tem duas partes: uma **extensão** para o Zen Browser e um **servidor MCP** que o Claude Code usa. Você precisa instalar as duas.

---

## Pré-requisitos

- [Zen Browser](https://zen-browser.app) instalado
- [Node.js](https://nodejs.org) versão 20 ou superior
- [Claude Code](https://claude.ai/code) instalado

Para verificar o Node.js, abra o terminal e rode:
```
node --version
```
O resultado deve ser `v20.x.x` ou maior.

---

## Parte 1 — Instalar a extensão no Zen Browser

1. Abra o **Zen Browser**
2. Na barra de endereço, digite `about:debugging` e pressione Enter
3. Clique em **"Este Firefox"** no menu à esquerda
4. Clique em **"Carregar extensão temporária..."**
5. Navegue até a pasta `beast-control/extension/` e selecione o arquivo `manifest.json`
6. A extensão aparece na lista — você verá o ícone do beast-control na barra de ferramentas

> A extensão temporária precisa ser recarregada toda vez que o Zen Browser for reiniciado. Isso é esperado para extensões de desenvolvimento local.

---

## Parte 2 — Instalar o servidor MCP

No terminal, entre na pasta do servidor e instale as dependências:

```bash
cd /caminho/para/beast-control/mcp-server
npm install
npm run build
```

---

## Parte 3 — Registrar o servidor no Claude Code

Crie ou edite o arquivo `.mcp.json` na pasta do seu projeto (ou `~/.claude/claude.json` para disponibilizar globalmente):

```json
{
  "mcpServers": {
    "beast-control": {
      "command": "node",
      "args": ["/caminho/completo/para/beast-control/mcp-server/dist/index.js"],
      "env": {
        "BEAST_CONTROL_PORT": "7331"
      }
    }
  }
}
```

Substitua `/caminho/completo/para/beast-control/` pelo caminho real no seu computador.

---

## Uso diário

1. Abra o **Zen Browser** (a extensão já está carregada)
2. Abra o **Claude Code** — ele iniciará o servidor MCP automaticamente
3. O ícone da extensão ficará **verde** quando a conexão estiver ativa
4. Peça ao Claude para fazer coisas no browser: "clique no botão de login", "preencha o formulário", etc.

### Toggle de privacidade

Por padrão, campos de senha, CPF, cartão de crédito e similares são **ocultados** antes de chegar ao Claude.

Para desativar temporariamente: clique no ícone do beast-control na barra do browser e ative o toggle **"Bypass de privacidade"**. O ícone ficará vermelho enquanto o bypass estiver ativo.

---

## Comandos disponíveis (para desenvolvedores)

Dentro do `mcp-server/`:

| Comando | O que faz |
|---------|-----------|
| `npm run build` | Compila TypeScript para JavaScript |
| `npm run dev` | Compila em modo watch (recompila ao salvar) |
| `npm run typecheck` | Verifica tipos sem compilar |

---

## Solução de problemas

**Ícone da extensão está cinza (desconectado)**
- Verifique se o Claude Code está aberto e o MCP server foi iniciado
- Confirme que a porta no popup da extensão é a mesma do `BEAST_CONTROL_PORT` (padrão: 7331)

**"Extensão beast-control não conectada" no Claude**
- Recarregue a extensão em `about:debugging`
- Reinicie o Claude Code

**Porta em uso**
- Mude `BEAST_CONTROL_PORT` no `.mcp.json` e atualize a porta no popup da extensão para o mesmo valor

**A extensão sumiu após reiniciar o Zen Browser**
- Extensões temporárias precisam ser recarregadas — veja o Passo 1.4 acima
