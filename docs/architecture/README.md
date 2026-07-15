# Architecture documentation

This directory contains maintainer-facing architecture decisions, contracts,
and operational protocols. Start with the documents below according to the
question you are answering.

| Question | Document |
|---|---|
| How are core skills, adapters, and bootstrap policy separated? | [Harness and bootstrap architecture](HARNESS_BOOTSTRAP_ARCHITECTURE.md) |
| Which directory is canonical for skills? | [ADR-002](ADR-002-canonical-skills-directory.md) |
| How does the plugin adapter fit the pack? | [ADR-001](ADR-001-plugin-adapter-bundle.md) |
| What is the harness/bootstrap decision? | [ADR-003](ADR-003-harness-bootstrap-architecture.md) |
| How do instruction files layer? | [Agent instruction contracts](AGENT_INSTRUCTION_CONTRACTS.md) |
| What are the recurring maintainer protocols? | [Maintainer protocols](MAINTAINER_PROTOCOLS.md) |

Task-specific discovery artifacts, when deliberately retained, live under
[`task-artifacts/`](task-artifacts/). They are not part of the end-user
installation flow.
