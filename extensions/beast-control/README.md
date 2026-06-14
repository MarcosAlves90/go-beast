# beast-control

> Optional tool from the **go-*** pack

A Firefox/Zen Browser extension that lets Claude Code control the browser for you — click buttons, fill forms, take screenshots, extract text, navigate between pages.

It works as a bridge: Claude Code talks to a local server, the server talks to the extension, the extension executes the action in the browser.

---

## Requirements

- [Zen Browser](https://zen-browser.app) installed
- [Node.js](https://nodejs.org) version 20 or higher (`node --version` should show `v20` or higher)
- [Claude Code](https://claude.ai/code) installed

---

## Installation (one-time)

**1. Install the extension in Zen Browser**

1. Open Zen Browser
2. Type `about:debugging` in the address bar and press Enter
3. Click **"This Firefox"** in the left menu
4. Click **"Load Temporary Add-on..."**
5. Navigate to the `beast-control/extension/` folder and select `manifest.json`

The beast-control icon appears in the toolbar. You will need to repeat these steps every time you restart Zen Browser.

**2. Install the MCP server**

```bash
cd /Users/marcos.lopes/Documents/@cherry-c/go-beast/extensions/beast-control/mcp-server
npm install
npm run build
```

**3. Register in Claude Code**

Create or edit `~/.claude/claude.json` and add inside `"mcpServers"`:

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

## Usage

1. Open Zen Browser with the extension loaded
2. Open Claude Code — the MCP server starts automatically
3. The extension icon turns **green** when the connection is active
4. Ask Claude whatever you want: *"click the submit button"*, *"fill the email field with x@example.com"*, *"take a screenshot of the page"*

### Available commands for Claude

| Command | What it does |
|---------|--------------|
| `browser_ping` | Checks whether the extension is connected |
| `browser_navigate` | Navigates to a URL |
| `browser_click` | Clicks an element |
| `browser_type` | Types text into a field |
| `browser_fill_form` | Fills multiple fields at once |
| `browser_scroll` | Scrolls the page |
| `browser_screenshot` | Takes a screenshot of the active tab |
| `browser_get_dom` | Gets the page HTML |
| `browser_get_text` | Extracts visible text |
| `browser_eval` | Executes JavaScript on the page (disabled by default) |

---

## Privacy

By default, **password, credit card number, and CVV fields** are redacted before any information reaches Claude. Screenshots also have these areas painted black.

**To temporarily disable:** click the extension icon and toggle "Privacy bypass". The icon turns red while active.

**To enable JS execution (`browser_eval`):** toggle "Allow JS execution" in the popup. Disable it when not needed.

---

## Troubleshooting

| Symptom | What to do |
|---------|-----------|
| Gray icon (disconnected) | Confirm Claude Code is open; verify the port in the popup matches `BEAST_CONTROL_PORT` (default: 7331) |
| "beast-control extension not connected" in Claude | Reload the extension at `about:debugging`; restart Claude Code |
| Port in use | Change `BEAST_CONTROL_PORT` in `claude.json` and update the port in the extension popup |
| Extension disappeared after restarting Zen | Reload via `about:debugging` → Load Temporary Add-on |

---

## Technical documentation

- [Detailed setup](docs/SETUP.md)
- [Architecture and technical decisions](docs/architecture/ADR.md)
- [Interface contracts](docs/architecture/CONTRACTS.md)
- [Security review](docs/security/SECURITY_REVIEW.md)
- [Testing strategy](docs/TESTING.md)

## Integration with the go-* pack

beast-control is registered as an optional MCP tool in Claude Code. The go-* pack beasts can use `browser_*` tools when Zen Browser is open with the extension active — go-lynx for UI verification, go-eagle for E2E tests, go-bear for inspecting security headers.

If beast-control is not connected, beasts fall back to Playwright.
