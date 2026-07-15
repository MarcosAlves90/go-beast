---
name: go-bear
version: 1.1.1
description: Runs a security review covering OWASP Top 10, authentication hardening, secrets management, dependency auditing, HTTP headers, and threat modeling for a software project.
when_to_use: Use when a feature handles auth, payments, PII, file uploads, or admin access — or when preparing for a security review, pen test, or compliance audit. Can be invoked at any phase; invoke early when compliance scope is detected.
---

# go-bear — Security Review & Hardening

<!-- BEGIN GENERATED: skill-contract -->
## Generated skill contract

- **ID:** `go-bear`
- **Alias:** `security` (documentation only)
- **Phase:** security
- **When to use:** Auth; payments; PII; uploads; admin access; or pre-release review
- **Prerequisites:** None
- **Input artifacts:** Source and configuration
- **Output artifacts:** THREAT_MODEL; SECURITY_REVIEW.md
- **Gates:** Security priority one; evidence for findings
- **Dependencies:** None
- **Conflicts:** None

The manifest defines this contract; the remainder of this skill defines how to fulfill it.
<!-- END GENERATED: skill-contract -->

go-bear does not move fast. It checks everything twice. Security is Priority 1 in the go-beast pack — go-bear enforces that.

## Quick start

```
Invoke before any feature involving: auth, payments, PII, file upload, admin access, external API credentials.
Also invoke before: first production deployment, compliance review, pen test.
```

## Workflow

### 1. Threat model

Before reviewing code, answer:
- What are the assets to protect?
- Who are the threat actors?
- What are the attack surfaces?
- What is the impact of a breach?

Document in `docs/security/THREAT_MODEL.md`.

### 2. OWASP Top 10 review

Work through the full OWASP checklist:
`${CLAUDE_SKILL_DIR}/references/owasp-checklist.md`

Record every finding in `docs/security/SECURITY_REVIEW.md` with this structure per finding:

```md
### <Finding title>
- **Severity:** Critical | High | Medium | Low
- **Status:** open | resolved | accepted
- **Description:** <what the issue is>
- **Remediation:** <what to do>
```

Every finding must have an explicit `severity` field. No finding may be left without a severity rating.

### 3. Secrets management

- [ ] No secrets in code or git history (`git log --all -S "secret"` scan)
- [ ] Secrets in env vars or a secrets manager (Vault, AWS Secrets Manager, Doppler)
- [ ] `.env` files gitignored
- [ ] Secrets rotation procedure documented
- [ ] CI/CD uses secrets manager, not hardcoded values

### 4. HTTP security headers

Every response must include:
```
Content-Security-Policy
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
```

Validate with securityheaders.com or equivalent.

### 5. Dependency audit

```bash
npm audit --audit-level=high   # or pip-audit / cargo audit
```

Any high or critical CVE is a release blocker unless a documented, time-bounded exception is approved.

### 6. Infrastructure hardening

Review and document findings for each area:

**IAM / access control**
- [ ] Principle of least privilege applied to all roles and service accounts
- [ ] No wildcard permissions (`*`) in production IAM policies
- [ ] MFA required for human accounts with production access

**Network**
- [ ] Services not exposed to the internet unless required
- [ ] VPC/firewall rules documented and reviewed
- [ ] TLS enforced on all endpoints (no HTTP in production)

**Secrets in infrastructure**
- [ ] No secrets in Terraform/IaC state files or CI logs
- [ ] Secrets manager (Vault, AWS Secrets Manager, GCP Secret Manager) used — not env vars in CI config

**Logging and monitoring**
- [ ] Auth events and permission denials logged
- [ ] Logs shipped to a system outside attacker reach
- [ ] Alerts defined for anomalous access patterns

Document findings in `docs/security/SECURITY_REVIEW.md` using the same severity/status format as step 2.

## Rules

- A security finding is never "lower priority later." Fix before release or document a time-bounded exception.
- Never implement auth from scratch. Use a vetted library or service.
- Default-deny is safer than default-allow.
- Security findings must be tracked as issues, not PR comments.

## Output

- `docs/security/THREAT_MODEL.md`
- `docs/security/SECURITY_REVIEW.md` — findings, severity, status (open/resolved/accepted)
- `docs/security/DEPENDENCY_AUDIT.md` — output of `npm audit` / `pip-audit` / `cargo audit` saved as Markdown; each entry includes: package name, CVE ID, severity (Critical/High/Medium/Low), affected version, fixed version, and resolution status (open/resolved/accepted-exception). High and Critical entries with status `open` are release blockers. go-raven consumes this file to gate the CI `security-audit` step.
