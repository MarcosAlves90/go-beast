# Testing Strategy — beast-control

## Pyramid

```
       /\
      /  \   E2E — outside automated scope
     /----\          (manual tests via MCP tools)
    /      \
   / Integr \  full WebSocket handshake
  /----------\
 /   Unit     \  redaction, sanitization, selectors
/--------------\
```

**Rationale by level:**

| Level | Tool | What it covers | Why this choice |
|-------|-----------|------------|----------------------|
| Unit | `node:test` + `tsx` | `sanitizeError`, `isSensitive` logic, serialization | No browser, no network — fast and deterministic |
| Integration | `node:test` + real WebSocket | HTTP token handshake + WS authentication | Tests the SEC-001 security contract end to end |
| E2E | Manual via MCP tools | Navigation, screenshots, multi-tab | Requires a real browser; covered during development sessions |

## Test files

| File | Type | What it tests |
|---------|------|------------|
| `src/bridge.test.ts` | Unit | `sanitizeError` — error normalization (SEC-009) |
| `src/handshake.test.ts` | Integration | One-shot token endpoint + unauthenticated client rejection (SEC-001) |
| `src/redaction.test.ts` | Unit | `isSensitive` — sensitive field selectors; `sanitizeError` inline |

## Running tests

```bash
cd mcp-server
npm test          # runs all tests
npm run typecheck # type-checks without compiling
```

## Coverage policy

- All security logic (redaction, handshake, sanitization) must have explicit coverage
- No numeric floor — the criterion is: each security decision has at least one happy-path test and one failure test
- Wiring code (MCP tool registration, `main()`) is outside automated coverage

## Flakiness policy

- Tests with timeouts (e.g., `handshake.test.ts` tests rejection by timeout at 500ms) are acceptable as long as the timeout is controllable by parameter
- Any test that fails intermittently must be fixed or deleted in the same sprint

## CI gate (when applicable)

```
npm run typecheck  # < 5s
npm test           # < 30s
```
