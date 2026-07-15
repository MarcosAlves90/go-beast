---
name: go-wolf
version: 1.3.0
description: Designs and implements REST or GraphQL APIs, business logic layers, authentication, authorization, middleware, and server-side validation following a strict layered architecture.
when_to_use: Use when building or extending backend services, implementing endpoints, handling auth flows, or writing server-side business logic. Invoke after go-beaver has produced a running scaffold, go-fox has produced CONTRACTS.md, and go-snipe has produced SPEC.md (or the team has explicitly decided to skip behavioral specification).
---

# go-wolf — Backend API Development

<!-- BEGIN GENERATED: skill-contract -->
## Generated skill contract

- **ID:** `go-wolf`
- **Alias:** `backend` (documentation only)
- **Phase:** backend
- **When to use:** Backend APIs or server-side business logic work
- **Prerequisites:** Scaffold and contracts
- **Input artifacts:** CONTRACTS.md and SPEC.md when applicable
- **Output artifacts:** API; business logic; validation
- **Gates:** Layered architecture and server validation
- **Dependencies:** go-beaver and go-fox
- **Conflicts:** None

The manifest defines this contract; the remainder of this skill defines how to fulfill it.
<!-- END GENERATED: skill-contract -->

go-wolf is the pack leader on the server side. It enforces disciplined API design, handles auth, and makes sure the backend is correct before the frontend touches it.

## Quick start

```
Prerequisites: CONTRACTS.md from go-fox, running scaffold from go-beaver, SPEC.md from go-snipe (or explicit decision to skip)
→ invoke go-wolf
→ route design → auth → business logic → validation → tests
```

## Workflow

### 1. Design routes before implementing

For each resource, write the contract before any code:

```
METHOD /resource[/:id]
  Auth: required | public | role:<name>
  Input: schema (body, query, params)
  Success: status + response shape
  Errors: list of expected codes and conditions
```

Do not implement until the contract matches `CONTRACTS.md`.

### 2. Implement in layers — never skip

```
Route handler → Middleware → Controller → Service → Repository → Database
```

- **Route**: HTTP wiring only. No business logic.
- **Controller**: parse and validate input, call service, format response.
- **Service**: business logic only. No HTTP, no SQL.
- **Repository**: all database access. No business logic.

### 3. Auth

- Authentication: JWT/session/API key verified as middleware.
- Authorization: RBAC/ABAC enforced in service layer, not route.
- Never trust client-supplied user IDs — derive identity from token.
- Passwords: bcrypt ≥ 12. Never store plain, MD5, or SHA1.
- Tokens: short-lived access + rotating refresh in httpOnly cookie.

### 4. Validation

- Validate all input at controller boundary. Reject early.
- Use a schema library (Zod, Joi, Pydantic) — never hand-roll.
- Return structured errors:
  ```json
  { "error": "VALIDATION_FAILED", "fields": [{ "field": "email", "message": "invalid format" }] }
  ```

### 5. Error handling

- Centralized error handler. No unhandled exceptions reaching the client.
- No stack traces, internal IDs, or DB errors exposed to the client.
- Log full context server-side; return sanitized message to client.

### 6. Per-endpoint test requirements

Every endpoint needs: happy path · auth failure (unauthenticated + unauthorized) · validation failure · not-found/conflict.

Invoke `go-eagle` for a broader QA plan. Invoke `go-bear` for security-critical services.

### 7. Security checklist (before marking any endpoint done)

- [ ] Input validated and sanitized
- [ ] Auth enforced on protected routes
- [ ] SQL/ORM queries use parameterized inputs
- [ ] Rate limiting considered on auth endpoints
- [ ] Sensitive data not logged

## Rules

- No business logic in route handlers.
- No HTTP concepts in service layer.
- Never return raw database errors to the client.
- Every endpoint needs at least one test before it is considered done.
- Do not write implementation code for an endpoint before its stub from SPEC.md exists and fails. Run the stub, confirm it fails, then implement until it passes.

## Output

- Implemented, tested API endpoints
- OpenAPI/Swagger spec (or updated `CONTRACTS.md`)
- Test coverage report
