#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [ ! -f "$REPO_ROOT/scripts/context-quality-benchmark.mjs" ]; then
  echo 'V2_CONTEXT_QUALITY_BENCHMARK_RED'
  exit 1
fi

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

KB_ROOT="$TEST_ROOT/knowledge"
TOOL="$REPO_ROOT/skills/go-squirrel/scripts/kb-tool.mjs"

node "$TOOL" init \
  --root "$KB_ROOT" \
  --kb-id context-quality-fixture \
  --title "Context quality fixture" \
  --purpose "Deterministic retrieval quality benchmark fixture." \
  --format md:plain >/dev/null

node - "$TEST_ROOT" <<'NODE'
const fs = require('fs')
const path = require('path')

const root = process.argv[2]
const records = [
  {
    id: 'cache-decision',
    title: 'Use bounded cache invalidation',
    record_type: 'decision',
    status: 'active',
    audience: 'both',
    summary: 'Invalidate cache by deployment version rather than time alone.',
    content: 'Use the deployment version as the cache namespace.',
    tags: ['architecture', 'caching'],
    aliases: ['cache namespace'],
    references: [],
    sources: ['docs/cache.md'],
    epistemic_status: 'sourced',
    confidence: 0.95,
    priority: 'high',
    retrieval_hints: ['cache', 'invalidation', 'deployment'],
  },
  {
    id: 'cache-risk',
    title: 'Benchmark cache policy before release',
    record_type: 'hypothesis',
    status: 'draft',
    audience: 'agent',
    summary: 'The cache policy needs a benchmark before the next release.',
    content: 'Measure cache invalidation behavior before changing the policy.',
    tags: ['cache', 'open-question'],
    aliases: [],
    references: [],
    sources: ['docs/cache.md'],
    epistemic_status: 'hypothesis',
    confidence: 0.6,
    priority: 'normal',
    retrieval_hints: ['cache', 'benchmark', 'release'],
  },
  {
    id: 'auth-decision',
    title: 'Require scoped API tokens',
    record_type: 'decision',
    status: 'active',
    audience: 'both',
    summary: 'API calls require scoped tokens with explicit authorization.',
    content: 'Reject API calls that do not carry the required scope.',
    tags: ['auth', 'security'],
    aliases: [],
    references: [],
    sources: ['docs/auth.md'],
    epistemic_status: 'sourced',
    confidence: 0.95,
    priority: 'high',
    retrieval_hints: ['authorization', 'scoped', 'token'],
  },
  {
    id: 'release-fact',
    title: 'Release archives contain checksums',
    record_type: 'fact',
    status: 'active',
    audience: 'agent',
    summary: 'Every release archive publishes a checksum for integrity verification.',
    content: 'Verify the archive checksum before installation.',
    tags: ['release', 'integrity'],
    aliases: [],
    references: [],
    sources: ['docs/releases.md'],
    epistemic_status: 'observed',
    confidence: 0.9,
    priority: 'high',
    retrieval_hints: ['release', 'checksum', 'integrity'],
  },
  {
    id: 'ui-note',
    title: 'Use larger headings in dark mode',
    record_type: 'fact',
    status: 'active',
    audience: 'human',
    summary: 'Dark mode headings use the preferred typography scale.',
    content: 'Keep dark mode headings readable on small screens.',
    tags: ['ui', 'typography'],
    aliases: [],
    references: [],
    sources: ['docs/ui.md'],
    epistemic_status: 'observed',
    confidence: 0.8,
    priority: 'low',
    retrieval_hints: ['dark-mode', 'typography'],
  },
].map(record => ({
  kind: 'record',
  schema_version: '1.0',
  ...record,
  created_at: '2026-09-14T00:00:00Z',
  updated_at: '2026-09-14T00:00:00Z',
  verified_at: '2026-09-14T00:00:00Z',
  provenance: [{
    origin: 'agent',
    actor: 'context-quality-test',
    source: 'tests/plugin/test-context-quality-benchmark.sh',
    captured_at: '2026-09-14T00:00:00Z',
    note: 'Deterministic benchmark fixture.',
  }],
  history: [],
}))

for (const [index, record] of records.entries()) {
  fs.writeFileSync(path.join(root, `record-${index}.json`), `${JSON.stringify(record, null, 2)}\n`)
}
NODE

for record in "$TEST_ROOT"/record-*.json; do
  node "$TOOL" add --root "$KB_ROOT" --record-file "$record" >/dev/null
done
node "$TOOL" validate --root "$KB_ROOT" >/dev/null

node "$REPO_ROOT/scripts/context-quality-benchmark.mjs" \
  --kb-root "$KB_ROOT" \
  --output "$TEST_ROOT/report.json" \
  --format json

node - "$TEST_ROOT/report.json" <<'NODE'
const fs = require('fs')

const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (report.schema_version !== 1 || report.kind !== 'go_beast_context_quality_report') throw new Error('benchmark report schema is invalid')
if (report.status !== 'PASS') throw new Error('benchmark did not pass')
if (report.cases.total !== 3 || report.cases.passed !== 3) throw new Error('benchmark case count is incorrect')
if (report.metrics.macro_recall !== 1 || report.metrics.macro_precision !== 1) throw new Error('relevance metrics are not perfect for the labelled fixture')
if (report.metrics.irrelevant_exclusion_rate !== 1) throw new Error('irrelevant exclusion metric is incorrect')
if (report.metrics.uncertainty_capture_rate !== 1) throw new Error('uncertainty capture metric is incorrect')
if (report.metrics.provenance_coverage_rate !== 1) throw new Error('provenance coverage metric is incorrect')
console.log('Context quality benchmark tests passed')
NODE
