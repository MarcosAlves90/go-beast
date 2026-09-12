#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
POLICY="$REPO_ROOT/SECURITY.md"

if [[ ! -f "$POLICY" ]]; then
  printf '%s\n' 'SECURITY-POLICY-RED: root SECURITY.md is missing'
  exit 1
fi

required_headings=(
  '## System and Scope'
  '## Threat Model and Trust Boundaries'
  '## Security Invariants'
  '## Reportable Findings and Severity Context'
  '## Private Vulnerability Reporting'
  '## Response and Triage Expectations'
  '## Compromised Release Handling'
  '## Supply-Chain Boundaries'
  '## Out of Scope, Exclusions, and Accepted Risk'
  '## Known Limitations and Compensating Controls'
)

for heading in "${required_headings[@]}"; do
  if ! grep -Fq "$heading" "$POLICY"; then
    printf 'SECURITY-POLICY-RED: missing heading: %s\n' "$heading"
    exit 1
  fi
done

required_terms=(
  'main'
  'v1.48.1'
  'security/advisories/new'
  'Do not report vulnerabilities through public GitHub issues.'
  '5 business days'
  '10 business days'
  'scripts/install.mjs'
  'hooks/'
  'plugins/go-beast/'
  'release-certificate.json'
  '.github/workflows/release-finalize.yml'
  'CONTRIBUTING.md'
  'docs/RELEASES.md'
  'attestation'
)

for term in "${required_terms[@]}"; do
  if ! grep -Fq "$term" "$POLICY"; then
    printf 'SECURITY-POLICY-RED: missing policy term: %s\n' "$term"
    exit 1
  fi
done

if grep -Fq 'private vulnerability reporting is enabled' "$POLICY"; then
  printf '%s\n' 'SECURITY-POLICY-RED: policy claims private reporting is enabled without verification'
  exit 1
fi

printf '%s\n' 'Security policy tests passed'
