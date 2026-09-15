#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

node -e 'const fs=require("node:fs"); const files={"docs/architecture/task-artifacts/ADR.md":["# ADR-007","## Decision","## Migration"],"docs/architecture/task-artifacts/STACK.md":["# Go Beast v2 stack","| Layer | Choice | Why | Risk |"],"docs/architecture/task-artifacts/DIAGRAM.md":["# Go Beast v2 component diagram","```mermaid"],"docs/architecture/task-artifacts/CONTRACTS.md":["# Go Beast v2 interface contracts","## Capability registry"],"docs/architecture/GO_BEAST_V2_ROADMAP.md":["# Go Beast v2 roadmap","## P0","## P1","## P2","## POLIS evidence"]}; for(const [p,needles] of Object.entries(files)){if(!fs.existsSync(p)){console.error("V2_ARCHITECTURE_POLIS_EVIDENCE_MISSING");process.exit(1)}const s=fs.readFileSync(p,"utf8");for(const n of needles)if(!s.includes(n)){console.error("V2_ARCHITECTURE_POLIS_EVIDENCE_MISSING");process.exit(1)}} console.log("GO_BEAST_V2_ARCHITECTURE_OK")'

echo "Go Beast v2 architecture tests passed"
