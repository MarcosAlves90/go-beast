# beast-control Setup

beast-control has two parts: an **extension** for Zen Browser and an **MCP server** used by Claude Code. You need to install both.

---

## Prerequisites

- [Zen Browser](https://zen-browser.app) installed
- [Node.js](https://nodejs.org) version 20 or higher
- [Claude Code](https://claude.ai/code) installed

To verify Node.js, open a terminal and run:
```
node --version
```
The output should be `v20.x.x` or higher.

---

## Part 1 — Install the extension in Zen Browser

1. Open **Zen Browser**
2. In the address bar, type `about:debugging` and press Enter
3. Click **"This Firefox"** in the left menu
4. Click **"Load Temporary Add-on..."**
5. Navigate to the `beast-control/extension/` folder and select the `manifest.json` file
6. The extension appears in the list — you will see the beast-control icon in the toolbar

> The temporary extension must be reloaded every time Zen Browser is restarted. This is expected for local development extensions.

---

## Part 2 — Install the MCP server

In the terminal, go to the server folder and install dependencies:

```bash
cd /path/to/beast-control/mcp-server
npm install
npm run build
```

---

## Part 3 — Register the server in Claude Code

Create or edit the `.mcp.json` file in your project folder (or `~/.claude/claude.json` to make it globally available):

```json
{
  "mcpServers": {
    "beast-control": {
      "command": "node",
      "args": ["/full/path/to/beast-control/mcp-server/dist/index.js"],
      "env": {
        "BEAST_CONTROL_PORT": "7331"
      }
    }
  }
}
```

Replace `/full/path/to/beast-control/` with the actual path on your machine.

---

## Daily use

1. Open **Zen Browser** (the extension is already loaded)
2. Open **Claude Code** — it will start the MCP server automatically
3. The extension icon will turn **green** when the connection is active
4. Ask Claude to do things in the browser: "click the login button", "fill out the form", etc.

### Privacy toggle

By default, password fields, tax ID numbers, credit card fields, and similar sensitive fields are **hidden** before reaching Claude.

To temporarily disable: click the beast-control icon in the browser toolbar and enable the **"Privacy bypass"** toggle. The icon will turn red while the bypass is active.

---

## Available commands (for developers)

Inside `mcp-server/`:

| Command | What it does |
|---------|-----------|
| `npm run build` | Compiles TypeScript to JavaScript |
| `npm run dev` | Compiles in watch mode (recompiles on save) |
| `npm run typecheck` | Type-checks without compiling |

---

## Troubleshooting

**Extension icon is gray (disconnected)**
- Verify that Claude Code is open and the MCP server has started
- Confirm that the port in the extension popup matches `BEAST_CONTROL_PORT` (default: 7331)

**"beast-control extension not connected" in Claude**
- Reload the extension in `about:debugging`
- Restart Claude Code

**Port in use**
- Change `BEAST_CONTROL_PORT` in `.mcp.json` and update the port in the extension popup to the same value

**The extension disappeared after restarting Zen Browser**
- Temporary extensions must be reloaded — see Step 1.4 above
