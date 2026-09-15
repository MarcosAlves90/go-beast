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
| How are strict delivery routes and evidence gates coordinated? | [ADR-004](ADR-004-delivery-controller.md) |
| How is protocol adherence checked without harness coupling? | [ADR-005](ADR-005-behavioral-conformance.md) |
| How are active-beast policy and harness decisions centralized? | [ADR-006](ADR-006-runtime-policy-gate.md) |
| How does the v2 workflow coordinator recover and hand off phases? | [ADR-008](ADR-008-workflow-engine-v2.md) |
| How is bounded, hash-verifiable phase context compiled? | [Context compiler](CONTEXT_COMPILER.md) and [ADR-009](ADR-009-context-compiler.md) |
| How do instruction files layer? | [Agent instruction contracts](AGENT_INSTRUCTION_CONTRACTS.md) |
| Where are transversal rules defined and generated? | [Transversal rules](TRANSVERSAL_RULES.md) |
| What are the recurring maintainer protocols? | [Maintainer protocols](MAINTAINER_PROTOCOLS.md) |

Discovery and solution-exploration outputs are transient session artifacts.
They are not part of the repository or the end-user installation flow.
