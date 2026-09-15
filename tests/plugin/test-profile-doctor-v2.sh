#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_HOME="$(mktemp -d)"
PROJECT_ROOT="$(mktemp -d)"
cleanup() {
  rm -rf "$TEST_HOME" "$PROJECT_ROOT"
}
trap cleanup EXIT

if ! grep -q "doctor" "$REPO_ROOT/bin/go-beast.mjs"; then
  printf '%s\n' 'PROFILE_DOCTOR_RED: doctor CLI is not wired'
  exit 1
fi

mkdir -p "$TEST_HOME/.go-beast" "$TEST_HOME/.codex/skills/go-fox" "$PROJECT_ROOT/.go-beast/sessions"

node - "$TEST_HOME/.go-beast/config.json" "$PROJECT_ROOT/.go-beast/profile.json" "$PROJECT_ROOT/.go-beast/sessions/session-1.json" <<'NODE'
const fs = require('node:fs')
const [globalPath, projectPath, sessionPath] = process.argv.slice(2)
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
write(globalPath, {
  schemaVersion: 1,
  agents: {
    codex: {
      skills: { mode: 'all', disabled: ['go-bear'] },
      hooks: { mode: 'all', disabled: [] },
    },
  },
  presets: {},
})
write(projectPath, {
  schemaVersion: 2,
  kind: 'go-beast-profile',
  agents: {
    codex: {
      skills: { mode: 'selected', enabled: ['go-fox', 'go-finch', 'go-smith'] },
      hooks: { mode: 'all', disabled: [] },
    },
  },
})
write(sessionPath, {
  schemaVersion: 2,
  kind: 'go-beast-profile',
  agents: {
    codex: {
      hooks: { mode: 'selected', enabled: ['go-beast-session-state.sh', 'go-beast-user-prompt-context.sh'] },
    },
  },
})
NODE

before_global="$(<"$TEST_HOME/.go-beast/config.json")"
before_project="$(<"$PROJECT_ROOT/.go-beast/profile.json")"
before_session="$(<"$PROJECT_ROOT/.go-beast/sessions/session-1.json")"

HOME="$TEST_HOME" node "$REPO_ROOT/bin/go-beast.mjs" doctor \
  --agent codex --home "$TEST_HOME" --project "$PROJECT_ROOT" --session session-1 \
  --repo "$REPO_ROOT" --format json > "$TEST_HOME/doctor.json"

node - "$TEST_HOME/doctor.json" <<'NODE'
const fs = require('node:fs')
const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (report.schema_version !== 2 || report.command !== 'doctor' || !report.valid) throw new Error(`doctor did not produce a valid v2 report: ${JSON.stringify(report)}`)
if (report.sources.length !== 3 || report.sources.some((source, index) => source.status !== 'loaded' || source.precedence !== index + 1)) {
  throw new Error('profile sources did not preserve global/project/session precedence')
}
if (JSON.stringify(report.effective.skills) !== JSON.stringify(['go-finch', 'go-fox', 'go-smith'])) throw new Error('project skill policy did not become effective')
if (JSON.stringify(report.effective.hooks) !== JSON.stringify(['go-beast-session-state.sh', 'go-beast-user-prompt-context.sh'])) throw new Error('session hook policy did not override project policy')
const decision = (asset, kind) => report.decisions.find(item => item.asset === asset && item.kind === kind)
if (decision('go-fox', 'skill')?.source !== 'project' || decision('go-fox', 'skill')?.precedence !== 2) throw new Error('project decision provenance is missing')
if (decision('go-beast-user-prompt-context.sh', 'hook')?.source !== 'session' || decision('go-beast-user-prompt-context.sh', 'hook')?.precedence !== 3) throw new Error('session decision provenance is missing')
if (!report.capability_gaps.some(item => item.asset === 'go-fox' && item.dependency === 'go-hawk')) throw new Error('missing dependency was not reported')
if (!report.conflicts.some(item => item.asset === 'go-finch' && item.conflict === 'go-smith')) throw new Error('skill conflict was not reported')
const unmanaged = report.ownership.skills.find(item => item.name === 'go-fox')
if (!unmanaged || unmanaged.state !== 'unmanaged') throw new Error('unmanaged ownership was not reported')
if (!report.mutations.skills.some(item => item.name === 'go-fox' && item.action === 'preserve')) throw new Error('dry-run did not preserve unmanaged target')
if (!report.mutations.skills.some(item => item.name === 'go-finch' && item.action === 'create')) throw new Error('dry-run omitted a managed link creation')
if (!report.mutations.config || report.mutations.config.add.length === 0) throw new Error('dry-run omitted hook configuration changes')
NODE

test "$before_global" = "$(<"$TEST_HOME/.go-beast/config.json")"
test "$before_project" = "$(<"$PROJECT_ROOT/.go-beast/profile.json")"
test "$before_session" = "$(<"$PROJECT_ROOT/.go-beast/sessions/session-1.json")"
test ! -e "$TEST_HOME/.codex/hooks.json"

HOME="$TEST_HOME" node "$REPO_ROOT/bin/go-beast.mjs" doctor \
  --agent codex --home "$TEST_HOME" --project "$PROJECT_ROOT" --session session-1 \
  --repo "$REPO_ROOT" --format text > "$TEST_HOME/doctor.txt"
grep -Fq 'doctor: codex' "$TEST_HOME/doctor.txt"
grep -Fq 'dry-run' "$TEST_HOME/doctor.txt"

HOME="$TEST_HOME" node "$REPO_ROOT/bin/go-beast.mjs" integration status \
  --agent codex --home "$TEST_HOME" --repo "$REPO_ROOT" --format json > "$TEST_HOME/v1-status.json"
node - "$TEST_HOME/v1-status.json" <<'NODE'
const fs = require('node:fs')
const status = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (status.agent !== 'codex' || !Array.isArray(status.skills)) throw new Error('v1 integration status no longer works')
NODE

printf '%s\n' '{"schemaVersion":999}' > "$PROJECT_ROOT/.go-beast/sessions/session-1.json"
if HOME="$TEST_HOME" node "$REPO_ROOT/bin/go-beast.mjs" doctor \
  --agent codex --home "$TEST_HOME" --project "$PROJECT_ROOT" --session session-1 \
  --repo "$REPO_ROOT" --format json > "$TEST_HOME/invalid.out" 2>&1; then
  echo 'malformed v2 profile unexpectedly passed' >&2
  exit 1
fi
grep -qi 'unsupported profile schemaVersion' "$TEST_HOME/invalid.out"

echo "Profile resolver and doctor tests passed"
