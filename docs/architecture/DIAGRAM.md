# Anti-Drift Component Diagram

```mermaid
flowchart TD
    U[User] --> A[Claude Code or Codex Session]
    A --> P[Instruction Policy\nAGENTS.global.md / AGENTS.bootstrap.md]
    A --> S[SessionStart Sync\nsync-go-beast-skills.sh]

    S --> H[Installed Hooks]
    P --> R[Runtime Policy Subset]

    H --> D[Drift Detector]
    D --> T[Session/Task State\n~/.go-beast]
    R --> D
    T --> D

    D -->|No drift| C[Continue Session]
    D -->|Low severity| M[Reminder]
    D -->|Medium severity| N[Re-anchor Message]
    D -->|High severity| B[Block Tool Use or Stop]

    N --> A
    M --> A
    B --> A

    A --> K[Skill Invocation\n go-mole / go-hawk / go-lark / ...]
    K --> T

    X[Local Tests and Live Harness Tests] --> H
    X --> D
```

## Notes

- `SessionStart` keeps assets current, but the anti-drift guard acts during the
  session, not only at startup.
- The state store is intentionally small and operational, not a replay log of
  the whole conversation.
- Skill invocation feeds state updates so the detector can tell what should
  happen next.
