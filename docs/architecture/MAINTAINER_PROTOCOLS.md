# Maintainer operational protocols

This document defines the procedural layer for go-beast maintainer-facing AI
workflows.

Instruction contracts answer:

- what the agent must do
- what the agent must not do
- what claims require evidence

Protocols answer:

- when a workflow starts
- what order the agent must follow
- what blocks progress
- what outputs unlock the next step

Protocols are not separate precedence layers. They operationalize
`AGENTS.global.md`, `AGENTS.bootstrap.md`, and repository-local `AGENTS.md`.

## Protocol design rules

Every protocol in this file must define:

- `Trigger`
- `Preconditions`
- `Required Steps`
- `Stop Conditions`
- `Outputs`
- `Exit Criteria`
- `Related go-* skills`

Protocol rules:

- Keep the set intentionally small.
- Prefer one protocol per high-risk workflow family.
- Do not restate full skill internals; reference the relevant skill instead.
- If a protocol overlaps with a stricter repository-local rule, follow the
  stricter repository-local rule.
- If bootstrap mode is active, apply the bootstrap-specific gates in addition to
  the protocol steps.

## Protocol map

The initial maintainer protocol set is:

1. Discovery Protocol
2. Implementation Protocol
3. Validation Protocol
4. PR/Release Protocol
5. Blocker/Escalation Protocol

These cover the highest-cost procedural failures in go-beast maintenance:

- coding before the problem is grounded
- making broad changes without checking current patterns
- declaring completion too early
- opening PRs with missing metadata or validation
- improvising past a real blocking condition

## 1. Discovery Protocol

### Trigger

Use when any of the following is true:

- the repository or subsystem is unfamiliar
- the request is underspecified
- the problem is not yet proven
- multiple valid approaches remain

### Preconditions

- The task is non-trivial.
- The agent does not yet have enough verified context to implement safely.

### Required Steps

1. Establish whether the repository or area is unfamiliar.
2. If unfamiliar, invoke `go-mole` first.
3. If requirements or scope are underspecified, invoke `go-hawk`.
4. If multiple viable solutions remain after discovery, invoke `go-lark`.
5. Record the specific artifact that now unlocks implementation.

### Stop Conditions

- The problem cannot be stated concretely.
- The root cause is still unknown where root-cause knowledge is required.
- The task would require implementation based on guesswork.
- A required discovery artifact was not produced.

### Outputs

- repository briefing or discovery notes
- requirements artifact when needed
- selected approach artifact when needed
- explicit statement of what now unblocks implementation

### Exit Criteria

- The agent can state the problem, constraints, and next implementation scope
  without relying on guesswork.
- Any required discovery artifact exists.

### Related go-* skills

- `go-mole`
- `go-hawk`
- `go-lark`

## 2. Implementation Protocol

### Trigger

Use after the task has been sufficiently grounded and actual changes are needed.

### Preconditions

- Discovery is complete for the current task, or the task is trivial enough not
  to require it.
- The agent can identify the files, interfaces, or docs that currently own the
  behavior.

### Required Steps

1. Inspect the existing implementation or documentation path that owns the
   behavior.
2. Check for repository patterns and architecture constraints before editing.
3. Choose the smallest responsible change that solves the proven problem.
4. Prefer the strongest relevant `go-*` skill if one covers the task better
   than ad-hoc implementation.
5. Keep the implementation aligned to the artifact that unlocked the work.

### Stop Conditions

- The planned change is broader than the proven problem.
- The implementation would create a precedent that should not be repeated.
- A simpler solution is available and has not been ruled out.
- The agent cannot explain why the chosen files are the correct place to edit.

### Outputs

- focused diff or documentation change
- explicit rationale for the chosen scope
- note of any intentional deviation from the discovery artifact

### Exit Criteria

- The change is scoped to one problem.
- The agent can explain why the chosen implementation path is the smallest
  responsible change.

### Related go-* skills

- `go-wolf`
- `go-lynx`
- `go-otter`
- `go-beaver`
- `go-jay`
- `go-swift`
- `go-wren`
- `go-smith`
- `go-finch`

## 3. Validation Protocol

### Trigger

Use before claiming the work is complete or ready for submission.

### Preconditions

- A change was made, or a completion claim is about to be made.

### Required Steps

1. Identify the strongest relevant validation available for the type of change.
2. Run that validation when the environment allows it.
3. If validation could not run, record the exact gap instead of implying
   success.
4. Verify documentation consistency when the change is docs-only.
5. State residual risk and remaining uncertainty explicitly.

### Stop Conditions

- No meaningful validation ran and the agent is about to claim completion.
- Required artifacts from a skill or bootstrap gate are missing.
- The agent would need to imply unchanged behavior without evidence.

### Outputs

- validation evidence
- list of unverified areas
- residual risk statement

### Exit Criteria

- The agent can say what was validated, what was not validated, and what that
  means for confidence.
- Completion claims do not exceed the available evidence.

### Related go-* skills

- `go-eagle`
- `go-bear`
- `go-owl`
- `go-tern`

## 4. PR/Release Protocol

### Trigger

Use when preparing to commit, open a PR, or describe a release-facing change.

### Preconditions

- The implementation and validation protocols have finished for the current
  scope.

### Required Steps

1. Confirm the change solves one problem and that unrelated edits are excluded.
2. Review the full diff before suggesting submission.
3. Ensure commit messages follow Conventional Commits.
4. Ensure the PR uses the repository template and includes a closing keyword
   when resolving an issue.
5. Update release-facing docs and version metadata when the change requires it.

### Stop Conditions

- The full diff has not been reviewed.
- Validation is missing but the PR is being described as ready.
- Required docs, changelog, or version bumps are missing.
- The PR scope bundles unrelated changes.

### Outputs

- reviewed diff
- PR-ready summary with validation and risk
- updated release metadata when required

### Exit Criteria

- The agent can explain the problem, root cause, change, validation, and risks
  without hand-waving.
- The PR or release metadata is internally consistent.

### Related go-* skills

- `go-owl`
- `go-tern`
- `go-raven`

## 5. Blocker/Escalation Protocol

### Trigger

Use when the task cannot safely proceed under the current evidence or
constraints.

### Preconditions

- A real blocking condition exists.

### Required Steps

1. Name the blocking condition concretely.
2. State what the agent cannot truthfully claim or safely do because of it.
3. Request the missing input, approval, or evidence when it is actionable.
4. Refuse or stop when the task would otherwise require fabrication or unsafe
   guessing.

### Stop Conditions

- The agent would need to invent requirements, results, or intent.
- The request conflicts with documented architecture or stricter repo policy.
- The user asks for a completion claim the evidence cannot support.

### Outputs

- explicit blocker statement
- requested next input or approval path
- refusal when applicable

### Exit Criteria

- The blocker is named clearly enough that a human can unblock it without
  reverse-engineering the session.
- The agent has not crossed the line into fabricated certainty.

### Related go-* skills

- `go-hawk`
- `go-tern`
- `go-bear`

## Relationship to instruction files

Use the protocol layer like this:

- `AGENTS.global.md` defines the baseline behavior contract.
- `AGENTS.bootstrap.md` tightens the behavior contract and adds stricter gates.
- Repository-local `AGENTS.md` can narrow or strengthen the workflow for that
  repository.
- This document defines the repeatable sequences that operationalize those
  rules.

Protocols do not override instruction precedence. They make the required order
of work explicit.

## Relationship to harness-specific behavior

These protocols are maintainer-facing and agent-agnostic by default.

They may reference optional harness-specific validation or automation, but they
must not assume that hooks, plugins, or a specific AI runtime are present unless
the active repository-local instructions explicitly require that harness.
