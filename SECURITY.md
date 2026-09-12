# Security Policy

## System and Scope

go-beast is a public, agent-agnostic skill pack. It distributes a Node.js CLI,
an installer, lifecycle hooks, workflow and evaluation files, optional Claude
Code/Codex/Copilot adapters, and release archives. These components can modify
local agent configuration and execute with the permissions of the user and
the selected agent harness. go-beast is not a hosted service and does not
provide a server-side security boundary for an installed agent.

This policy covers the repository source, generated instruction surfaces,
`scripts/install.mjs`, lifecycle hooks, plugin bundles, workflow inputs and
state, release automation, release certificates, archives, and GitHub Actions.

## Supported Versions

| Version or line | Support status | Notes |
|---|---|---|
| `main` | Supported | Current development line; the repository currently declares package version `1.52.0`. |
| `v1.48.1` | Supported | Latest published GitHub release at the time this policy was written. |
| Older releases | Not supported | No security backport commitment is made. |

The version table must be reviewed whenever a release is published or a
development line is retired.

## Threat Model and Trust Boundaries

Important assets include source and instruction files, release archives and
tags, plugin and hook payloads, installer behavior, workflow state, release
credentials, `release-certificate.json`, and GitHub attestation records.

Maintainers and approved GitHub Actions are trusted to review and publish
changes. Repository files, pull-request content, workflow manifests, persisted
state, event traces, command arguments, dependency metadata, and agent-facing
text must be treated as potentially untrusted input. Hook and installer
execution crosses from repository content into a user's local agent and
filesystem; release publication crosses from GitHub source control into
consumer environments.

## Security Invariants

- Untrusted repository content or agent-facing text must not silently grant
  privileged mutations, secret disclosure, or bypass of an approval gate.
- File and command operations must remain within their declared repository or
  installation boundary and must fail closed when required state is malformed.
- Security reports must remain private until the maintainer and reporter agree
  that disclosure is safe.
- Release artifacts must be traceable to a reviewed source state and checked
  against the available certificate or attestation evidence before consumers
  rely on that evidence.
- Secrets, credentials, private reports, and personal data must not be added to
  the repository or reproduced in public issue discussions.

These are policy expectations. They are not a claim that every current path
has been formally proven to satisfy them.

## Reportable Findings and Severity Context

Report findings with a realistic, reproducible impact on a supported surface.
Examples include arbitrary command execution through the installer, hooks,
plugins, or workflows; bypass of a permission or approval boundary; release,
archive, certificate, or attestation tampering; credential or secret
disclosure; unsafe path traversal; and code or instruction injection that
crosses into a user's local agent environment.

- **Critical:** compromise of a published release or maintainer/release
  credentials, or reliable code execution across consumers.
- **High:** privilege or approval bypass, arbitrary command execution, secret
  disclosure, or integrity loss in a supported installation path.
- **Medium:** a constrained integrity or isolation failure requiring meaningful
  local conditions or affecting a limited supported surface.
- **Low:** defense-in-depth or documentation weaknesses without a realistic
  exploit path. A weakness becomes reportable when it combines with another
  issue to cross a trust boundary.

## Private Vulnerability Reporting

Do not report vulnerabilities through public GitHub issues. Use the repository's
[GitHub Security Advisory form](https://github.com/MarcosAlves90/go-beast/security/advisories/new)
as the primary private reporting path. Include the affected version or commit,
impact, reproduction steps or a minimal proof, and any known mitigations. Do
not include secrets or unnecessary personal data.

GitHub currently reports its private vulnerability reporting feature as disabled
for this repository. If the advisory form is unavailable, contact the
maintainer account [@MarcosAlves90](https://github.com/MarcosAlves90) through a
private GitHub channel and request a private reporting channel before sharing
technical details. Do not move the report to a public issue, pull request, or
public chat.

## Response and Triage Expectations

Maintainers aim to acknowledge a report within **5 business days** and provide
an initial triage result or status update within **10 business days**. These
are response targets, not service-level guarantees; critical reports may be
handled sooner and complex reports may require additional investigation.

Reports are triaged for reachability, affected supported versions, trust-boundary
impact, exploitability, and realistic consumer impact. The maintainer may ask
for clarification through the private channel, coordinate a fix and advisory,
or explain why the report is not actionable. Reporter credit is given when
requested and safe.

## Compromised Release Handling

If release, archive, certificate, attestation, or release-credential compromise
is suspected, maintainers will, as applicable:

1. pause publication and warn consumers not to install or rely on the affected
   release;
2. preserve relevant evidence and identify the last trusted commit, tag, and
   `release-certificate.json` state;
3. rotate or revoke exposed GitHub, signing, registry, and CI credentials;
4. withdraw, replace, or mark the affected release and publish a notice through
   the repository's release and security channels;
5. rebuild from a reviewed trusted baseline, rerun verification, and publish a
   replacement release with fresh certificate and attestation evidence; and
6. notify affected consumers and coordinate a security advisory when users may
   have executed compromised code.

The release workflow and attestation process provide evidence and automation
for parts of this response, but they do not automatically detect or remediate
every compromise.

## Supply-Chain Boundaries

- **Source and review:** Git history, pull requests, maintainer access, and
  generated surfaces determine what enters a release.
- **Installer:** `scripts/install.mjs` selects and wires skills, workflows, and
  hooks into user agent directories; users must review the source and selected
  targets before execution.
- **Hooks:** `hooks/manifest.json` and hook scripts can observe prompts, block
  or allow tool operations, and modify local harness configuration. Hook
  wiring is a privileged local integration, not a sandbox.
- **Plugin bundle:** `plugins/go-beast/` contains adapter manifests and links
  to canonical skills. The plugin directory is an adapter surface; `skills/`
  remains the canonical source.
- **Workflows and state:** workflow manifests, persisted state, event traces,
  and generated artifacts influence orchestration and must be treated as
  untrusted input at their boundary.
- **Release and CI:** tags, release archives, `release-certificate.json`,
  `.github/workflows/release-finalize.yml`, GitHub Actions permissions, and
  attestation records form the publication boundary.
- **Dependencies and hosts:** Node.js, npm, GitHub, operating systems, agent
  harnesses, and third-party services are external boundaries. A project
  integration that makes an external weakness reachable remains reportable.

## Out of Scope, Exclusions, and Accepted Risk

This policy does not promise a bug bounty or compensation. Vulnerabilities in
GitHub, Node.js, an operating system, or an agent harness are not by themselves
go-beast findings unless the project introduces an unsafe integration or makes
the weakness reachable through a supported surface. Cosmetic documentation
issues without a security consequence are not security reports.

No additional accepted risks are declared by this policy. A limitation or an
external dependency is not a waiver for a reachable project-introduced risk.

## Known Limitations and Compensating Controls

- GitHub private vulnerability reporting is currently unavailable for this
  repository, so the fallback private contact path is required until the owner
  enables the feature.
- `npm run verify`, POLIS packages, release certificates, and GitHub
  attestations provide evidence about tested and published states; they do not
  prove model intent, runtime isolation, absence of all vulnerabilities, or
  correctness of every external dependency.
- Hooks and installers run with user and harness permissions. Use a reviewable
  checkout, least-privilege credentials, and a trusted release source.
- The supported-version table and response targets are maintained policy
  statements and can become stale; review them during release preparation.

For contribution and release procedures, see
[`CONTRIBUTING.md`](CONTRIBUTING.md) and [`docs/RELEASES.md`](docs/RELEASES.md).
