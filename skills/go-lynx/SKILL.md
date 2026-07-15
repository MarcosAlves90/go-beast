---
name: go-lynx
version: 1.3.0
description: Builds frontend UIs with correct component architecture, state management, API integration, accessibility, and responsive design — wired to a real backend, not mocked.
when_to_use: Use when building or extending frontend applications, designing component hierarchies, wiring up API calls, managing client state, or implementing UI features. Invoke after go-wolf has a running backend (or a mocked API contract) and go-snipe has produced SPEC.md (or the team has explicitly decided to skip behavioral specification).
---

# go-lynx — Frontend UI Development

<!-- BEGIN GENERATED: skill-contract -->
## Generated skill contract

- **ID:** `go-lynx`
- **Alias:** `frontend` (documentation only)
- **Phase:** frontend
- **When to use:** Frontend UI; state; API; or accessibility work
- **Prerequisites:** Backend or API contract
- **Input artifacts:** CONTRACTS.md and SPEC.md when applicable
- **Output artifacts:** Components; state; API integration
- **Gates:** Accessibility and real integration
- **Dependencies:** go-wolf or go-snipe
- **Conflicts:** None

The manifest defines this contract; the remainder of this skill defines how to fulfill it.
<!-- END GENERATED: skill-contract -->

go-lynx moves fast and precise. It builds UIs that are functional, accessible, and integrated with the backend — not just pretty mocks.

## Quick start

```
Prerequisites: Running backend from go-wolf (or mocked API), scaffold from go-beaver, SPEC.md from go-snipe (or explicit decision to skip)
→ invoke go-lynx
→ component design → routing → state management → API integration → accessibility
```

## Workflow

### 1. Plan component hierarchy before building

```
Page
└── FeatureContainer (data fetching, state)
    ├── FeatureHeader (display only)
    ├── FeatureList
    │   └── FeatureItem (display only)
    └── FeatureForm (controlled input + submission)
```

Rule: containers fetch and hold state. Leaves receive props and render. Never mix.

### 2. State management

| Data type | Tool |
|---|---|
| Server state (API data, cache) | TanStack Query / SWR |
| Global UI state (auth, theme, notifications) | Zustand / Context |
| Local component state | `useState` |
| Form state | React Hook Form + Zod |

Never put server state in global store. Never fetch inside display components.

### 3. Routing

- Use file-based routing if the framework supports it (Next.js, Remix, SvelteKit).
- Protect auth routes: redirect unauthenticated users before rendering.
- Handle loading and error states at route level, not inside components.

### 4. API integration

- Centralize all API calls in `/lib/api` or `/services` — never `fetch()` inline in components.
- Type all payloads — share types with backend via `packages/types` if monorepo.
- Handle API errors explicitly: user-facing message + server-side log.
- Never expose API keys or tokens in client-side code.

### 5. Accessibility checklist

Every interactive element must:
- [ ] Be reachable via keyboard (Tab, Enter, Space, Escape)
- [ ] Have a visible focus indicator
- [ ] Have an accessible label (`aria-label`, `aria-labelledby`, or visible text)
- [ ] Communicate state changes to screen readers (`aria-live`, `role="status"`)

Use semantic HTML first. ARIA only when semantics are insufficient.

### 6. Responsive design

- Mobile-first: base styles are mobile, breakpoints add complexity.
- Test at 320px, 768px, 1280px minimum.
- No fixed pixel widths on layout containers.

### 7. Performance baseline

- Lazy-load routes and heavy components.
- Never import an entire library to use one function.
- No `useEffect` for data fetching — use the query library.

### 8. Verify in browser

Use the `verify` skill or Playwright to confirm:
- [ ] Golden path works end to end
- [ ] Loading and error states render correctly
- [ ] Auth redirects work
- [ ] Mobile layout is usable

## Rules

- No business logic in components. Move to hooks or services.
- No API calls in display components.
- No hardcoded user-facing strings — prepare for i18n from day one.
- Every form handles: loading · success · validation errors · server errors.
- Do not write implementation code for a component before its stub from SPEC.md exists and fails. Run the stub, confirm it fails, then implement until it passes.

## Output

- Implemented UI features, wired to API
- Component directory with clear naming convention
- All features verified in a real browser
