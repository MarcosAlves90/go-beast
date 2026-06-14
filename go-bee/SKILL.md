---
name: go-bee
version: 1.2.0
description: "Designs and implements Workflow scripts (.js files that use agent(), pipeline(), parallel(), phase(), log(), and schema) for multi-agent orchestration. Covers: decomposing a task into phases, choosing pipeline vs parallel vs loop patterns, defining JSON schemas for structured agent output, writing the meta block, and registering the workflow in the pack."
when_to_use: "Use when a task requires fan-out to multiple agents, parallel execution, multi-phase pipelines, or automated evaluation harnesses. Invoke after the task is well-understood (go-hawk or user description) and before the workflow is needed. Workflows live in the go-beast workflows/ directory and are invoked via the Workflow tool."
---

# go-bee — Workflow Authoring

go-bee orchestrates swarms. It designs and implements multi-agent Workflow scripts — the `.js` files that fan work out across many agents, pipeline results through stages, and synthesize findings at scale. Its discipline: every workflow is deterministic in structure, even when agents are non-deterministic in output.

## Quick start

```
User: "Write a workflow that tests all go-* skills against 4 input profiles."
→ invoke go-bee
→ define purpose and phases → choose orchestration pattern → write script → register in pack
```

## Workflow

### 1. Define purpose, scope, and phases

Before writing any code, answer:

- [ ] What is the workflow's single responsibility? (one sentence)
- [ ] What are the inputs? (static data, `args`, or both)
- [ ] What are the phases? (named stages visible in the progress UI)
- [ ] What does the workflow return? (summary object, report path, or both)
- [ ] Does it need `args` to be parameterized? (e.g. `args.skills` to filter)

Produce the **meta block** first:

```js
export const meta = {
  name: 'workflow-name',
  description: 'One sentence describing what this workflow does.',
  phases: [
    { title: 'Phase 1', detail: 'What happens in this phase' },
    { title: 'Phase 2', detail: 'What happens in this phase' },
  ],
}
```

Rules for `meta`:
- `meta` must be a **pure literal** — no variables, function calls, spreads, or template strings
- `name` must match the filename (without `.js`)
- One entry per `phase()` call in the script body

### 2. Choose the orchestration pattern

Select the correct primitive for each stage:

| Pattern | Use when | Primitive |
|---------|----------|-----------|
| Sequential stages, no barrier | Each item can proceed independently through all stages | `pipeline(items, stage1, stage2, ...)` |
| All results needed before next step | Dedup, merge, or early-exit requires ALL prior results | `parallel(thunks)` then process |
| Accumulate to target count | Discovery loop until N items found | `while (found.length < N)` |
| Budget-gated loop | Scale depth to user's token target | `while (budget.total && budget.remaining() > threshold)` |

**Default to `pipeline()`**. Only reach for a `parallel()` barrier when stage N genuinely needs all stage N-1 results simultaneously (dedup, cross-item comparison, early-exit on zero). If you find yourself writing `parallel()` followed by a map/filter and another `parallel()`, rewrite as `pipeline()`.

Checklist:
- [ ] Are items independent? → `pipeline()`
- [ ] Do you need all prior results to proceed? → `parallel()` barrier
- [ ] Are you discovering an unknown-size set? → `while` loop with dry-run counter
- [ ] Does the user have a `+Nk` token budget? → check `budget.total`

### 3. Define schemas for structured agent output

Any `agent()` call that must return typed data needs a JSON Schema:

```js
const MY_SCHEMA = {
  type: 'object',
  required: ['field1', 'field2'],
  properties: {
    field1: { type: 'string' },
    field2: { type: 'array', items: { type: 'string' } },
    field3: { type: 'number' },
  },
}

const result = await agent('prompt here', { schema: MY_SCHEMA, label: 'my-agent' })
// result is already the validated object — no JSON.parse needed
```

Rules for schemas:
- [ ] Always declare `required` — omitting it means no field is guaranteed
- [ ] Never use `schema` when the agent needs to produce free-form Markdown or prose — only use it when you need to process the output programmatically
- [ ] The save-report agent **never** uses `schema` — it is prose-driven (Write tool call). Omit schema from the save-report call. It still requires `label` and `phase`.
- [ ] **Discovery agents that return arrays MUST use a schema.** An agent() without a schema returns a string. If the next pipeline stage iterates over the result, it will silently iterate over characters instead of items. Always define an array schema for discovery agents: `{ type: 'object', required: ['items'], properties: { items: { type: 'array', items: { type: 'object' } } } }`
- [ ] Each `agent()` call must have a `label` and `phase` — both appear in the progress UI and the progress tree. No exceptions, including the save-report agent.
- [ ] Each `agent()` call inside a `pipeline()` or `parallel()` must have `phase: 'Phase Name'` matching a `meta.phases` entry
- [ ] Labels for per-item agents must be short and stable — prefer `audit-${i}` (index) or `audit-${path.basename(file)}` (filename only) over full file paths, which produce unreadably long labels

### 4. Write the script body

Structure every workflow the same way:

```js
// 1. Data definitions (static inputs, args, helper functions)
// 2. Schemas
// 3. phase() + pipeline()/parallel()/while loop
// 4. Aggregation (phase() + summarize results)
// 5. return { summary object }
```

Key rules:
- `Date.now()`, `Math.random()`, and argless `new Date()` are **forbidden** — they break resume. Pass timestamps via `args` or stamp after the workflow returns.
- `log('message')` emits a narrator line above the progress tree — use for milestones, not per-item noise
- `workflow('name', args)` runs a child workflow inline — one level of nesting only
- `budget.spent()` and `budget.remaining()` are available — check `budget.total` before using (it is `null` when no target is set)
- Never hardcode absolute paths — use `args?.home ?? '/default'` for user-specific paths
- **Build agent prompts lazily, inside the stage function.** Never construct a prompt string at the top of the script using variables that will only be populated later. Prompts that reference pipeline state (e.g., `${items}`) must be inside the `async (item) =>` callback, not outside the pipeline call.
- **Use a single `pipeline()` for all sequential stages of the same item set.** Do not split one logical pipeline into two separate `pipeline()` calls — this breaks the intended data flow and is harder to read.
- **`meta` must be a pure literal.** No array values with computed defaults, no template strings, no function calls. If args have defaults, document them in a comment below `meta`, not inside it: `// args.labels defaults to ['security']`

### 4b. Guard against null results

`pipeline()` and `parallel()` may return `null` for items where an agent failed. Always filter before accessing results:

```js
const valid = results.filter(Boolean)
if (valid.length === 0) {
  log('No results — skipping report.')
  return { total: 0, findings: [] }
}
```

Do not access `results[0].someField` without first checking `results[0]` is not null.

### 5. Write the save-report agent (if the workflow produces a report)

Workflows that produce Markdown reports must save them via an agent call:

```js
await agent(
  `Save the following Markdown content to the file <path>/report.md
(create directories if needed using Bash or mcp__filesystem__create_directory).
Use the Write tool to write the file.

CONTENT:
${reportContent}`,
  { label: 'save-report', phase: 'Aggregation' }
)
```

- [ ] Report path must not include a hardcoded username
- [ ] Use `args?.home ?? os.homedir()` pattern if the path is user-specific
- [ ] `log('Report saved to <path>')` after the agent call

### 6. Register in the pack

1. Place the file in `workflows/<name>.js`
2. Add to the Workflows table in `README.md`
3. Add to `go-skill-eval.js` if the workflow is an eval harness (add `SKIP_INPUTS_FOR_SCORE` if needed)
4. Update `CHANGELOG.md` and bump pack version (minor)
5. Run the workflow with a minimal test invocation to verify it executes without errors before registering

## Rules

- `export const meta` must be the first statement and a pure literal — no computed values.
- Every `agent()` call must have a `label`. Every `agent()` inside a multi-stage pipeline must have a `phase` matching a `meta.phases` entry.
- Never use `pipeline()` when you need a barrier — and never use a `parallel()` barrier when `pipeline()` suffices. The smell test: if the code between two `parallel()` calls is just `map`/`filter`/`flat`, rewrite as `pipeline()`.
- Do not use `Date.now()`, `Math.random()`, or `new Date()` without arguments — they break workflow resume.
- A workflow with no `return` statement is incomplete. Always return a summary object.

## Output

- `workflows/<name>.js` — complete, runnable Workflow script with `export const meta`, correct primitives, schemas, labels, phases, and a `return` statement
- Updated `README.md` — workflow added to the Workflows table
- Updated `CHANGELOG.md` entry

## Position in the pack

```
(task defined) → go-bee → (workflow runs)
```

go-bee is a meta-skill invoked on demand. It does not depend on a preceding beast — it can be called whenever a multi-agent workflow needs to be built or extended. go-eagle may hand off to go-bee when a test suite requires parallel execution at scale. go-kite may hand off to go-bee when an audit requires fan-out research.
