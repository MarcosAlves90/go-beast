# Test Levels Reference

## Unit tests

**What to test:**
- Business logic in service layer
- Utility functions and transformers
- Validation rules
- State machine transitions

**What NOT to test:**
- Framework wiring (routes, middleware registration)
- Database queries (integration level)
- Rendering markup (component or E2E level)

**Rules:**
- One assertion per test when possible
- Test behavior, not implementation
- No time-dependent logic without injectable clocks
- No HTTP calls, no DB, no filesystem — mock at the boundary

## Integration tests

**What to cover:**
- API endpoints: full request → handler → service → repository → DB → response
- Database: migrations apply cleanly, queries return correct results
- Auth flows: token issuance, validation, expiry, refresh

**How:**
- Use a real test database (not mocks)
- Seed known state before each test
- Tear down after

## End-to-end tests

**Tool:** Playwright (preferred) or Cypress

**Golden paths to cover:**
- User registration and login
- Core CRUD flows for the main entity
- Payment or critical business event (if applicable)
- Auth-protected routes redirect unauthenticated users

**Constraint:** E2E tests must run against a deployed environment (staging or local Docker stack), never against mocked APIs.

## Contract tests

If the project has multiple services:
- Use consumer-driven contract tests (Pact or equivalent)
- Producer must not break an existing consumer contract without coordination

## Performance tests

For any endpoint expected to handle > 100 req/s:
- Define a target: p95 latency under X ms at Y req/s
- Run a baseline load test (k6, Locust) and record results
- Failing to meet the target is a release blocker, not a future ticket
