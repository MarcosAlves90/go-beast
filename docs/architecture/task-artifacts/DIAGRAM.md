# Go Beast v2 component diagram

```mermaid
flowchart TD
    Developer[Developer / maintainer]
    Agent[External AI agent or trusted runner]
    Harness[Claude / Codex / Copilot / future harness]

    Core[Portable core\nskills/*.md + docs]
    Registry[Capability registry\nversioned structural facts]
    Profiles[Profile resolver\nglobal > project > session > agent]
    Route[Route compiler\ntask kind + capabilities]
    Policy[Runtime policy gate\nphase + approval + unlock]
    Workflow[Workflow engine\nstate + locks + resume]
    Context[Context compiler\nbounded go-squirrel packets]
    Ledger[Evidence ledger\ndeclared / observed / verified]
    Adapter[Harness adapter SDK\nevents + install + config]
    Distribution[Distribution transaction\npreview + integrity + rollback]
    Repo[Project filesystem\nartifacts + state + records]
    CI[CI / release verification]

    Developer --> Profiles
    Developer --> Route
    Agent --> Core
    Agent --> Policy
    Harness --> Adapter
    Core --> Registry
    Registry --> Profiles
    Registry --> Route
    Profiles --> Route
    Route --> Workflow
    Workflow --> Policy
    Policy --> Agent
    Agent --> Adapter
    Adapter --> Ledger
    Workflow --> Ledger
    Workflow --> Context
    Context --> Repo
    Ledger --> Repo
    Workflow --> Repo
    Core --> Distribution
    Distribution --> Harness
    Distribution --> Repo
    Ledger --> CI
    Repo --> CI
```

## Boundary notes

- `skills/` remains the semantic and procedural source; the registry contains
  only structural metadata.
- The external agent remains responsible for substantive work. The control
  plane coordinates, gates, records, and verifies observable evidence.
- The project filesystem is the default durable boundary. User prompts and
  secrets are not copied into the ledger or context automatically.
- Adapters can expose less capability than the core and must report that gap
  rather than silently pretending parity.
