# Agent instruction contracts

This document explains how go-beast writes strong `AGENTS.md`-style files for
AI agents and how `AGENTS.md`, `AGENTS.global.md`, and `AGENTS.bootstrap.md`
relate to each other.

## Purpose

The goal is not to make instruction files longer. The goal is to make them
harder to misread as optional guidance.

A strong instruction contract should:

- separate hard rules from defaults
- separate behavioral gates from explanation
- define what must be verified before completion
- define what the agent must never claim without evidence
- make precedence explicit when multiple instruction files exist

## File roles

### `AGENTS.global.md`

Baseline contract for agents that install go-beast global instructions.

It should define:

- global operating rules
- validation obligations
- forbidden claims
- optional harness stance
- reusable skill and workflow defaults

It should not contain repository-local conventions.

### `AGENTS.bootstrap.md`

Optional stricter overlay for sessions that want stronger discovery and gating.

It should define:

- stricter precedence and gating behavior
- mandatory discovery sequencing
- elevated stop conditions
- completion gates tied to produced artifacts

It should not redefine harness installation behavior or act as a hidden runtime
configuration layer.

### Repository-local `AGENTS.md`

Repository-specific contract for maintainers of that repository.

It should define:

- repository conventions
- file structure expectations
- release and contribution rules
- architecture boundaries specific to that repo

It may be stricter than global or bootstrap instructions for repository-local
work.

## Precedence model

Use this order:

1. System and harness rules
2. Repository-local `AGENTS.md`
3. `AGENTS.bootstrap.md` when explicitly active
4. `AGENTS.global.md`

Interpretation rules:

- stricter instructions win
- repository-local instructions specialize the current repo
- bootstrap tightens behavior; it does not loosen baseline rules
- global instructions fill the default contract when nothing stricter overrides them

## Techniques for stronger agent contracts

Use these techniques deliberately.

### 1. Separate rule strength explicitly

Do not mix all guidance into one bullet list.

Use sections such as:

- `Mandatory Operating Rules`
- `Default Behavior`
- `Stop Conditions`
- `Validation Requirements`
- `Forbidden Claims`

This makes it clear what is mandatory versus preferred.

### 2. Use behavioral gates, not aspirations

Weak:

- "Try to investigate first."

Strong:

- "Do not implement until the relevant investigation artifact exists."

The stronger pattern changes what the agent is allowed to do, not just what it
is encouraged to prefer.

### 3. Name the blocking condition

When a task must stop, say exactly why.

Weak:

- "Ask when needed."

Strong:

- "Stop when the problem is not proven, the root cause is unknown, or the change would require guessing requirements."

### 4. Forbid unverifiable claims explicitly

Agents often overstate certainty unless forbidden claims are named directly.

List claims that require evidence, such as:

- test results
- unchanged behavior
- security guarantees
- compatibility guarantees
- user intent

### 5. Separate facts from inference

Instruction files should force the agent to distinguish:

- what was observed
- what was validated
- what was inferred

Without this separation, the same paragraph can hide both evidence and guesswork.

### 6. Tie completion to validation

Do not let "done" mean "implemented."

Completion should require:

- the required artifact exists
- the strongest relevant validation ran, or the gap is disclosed
- residual risk is stated

### 7. Keep non-goals explicit

If a file is often misunderstood, document what it must not do.

Example:

- bootstrap mode must not silently install hooks or mutate runtime config

This prevents boundary drift.

## Review checklist for instruction changes

Before merging an `AGENTS.md`-style change, verify:

- mandatory rules are distinct from defaults
- stop conditions are concrete and enforceable
- forbidden claims are explicit
- precedence between files is documented
- completion criteria require evidence
- repository-local versus global scope is clear
- non-goals are documented where confusion is likely

## When to add a new instruction file

Add a new file only if it has a distinct scope and distinct precedence.

Do not add a new instruction file just to hold extra prose. Prefer tightening an
existing contract unless the new file represents:

- a different scope
- a different activation mode
- or a different precedence layer
