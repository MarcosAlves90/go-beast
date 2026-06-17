# OWASP Top 10 Checklist

## A01 — Broken Access Control
- [ ] Every route checks auth and authorization
- [ ] No IDOR: ownership verified from token, not from client-supplied ID
- [ ] Admin routes are separate and additionally protected

## A02 — Cryptographic Failures
- [ ] No sensitive data in plaintext at rest or in transit
- [ ] HTTPS enforced everywhere; HSTS header set
- [ ] Passwords hashed with bcrypt (cost ≥ 12)
- [ ] No MD5 or SHA1 for security purposes

## A03 — Injection
- [ ] All DB queries use parameterized inputs — no string concatenation
- [ ] No `eval`, no `exec` with user-supplied input
- [ ] HTML output escaped; CSP header set

## A04 — Insecure Design
- [ ] No security-by-obscurity (hidden routes, unpublished endpoints)
- [ ] No client-side authorization logic
- [ ] Threat model exists and was reviewed

## A05 — Security Misconfiguration
- [ ] Debug mode off in production
- [ ] Default credentials changed or removed
- [ ] Unnecessary features, ports, services disabled
- [ ] Error messages do not expose stack traces, DB names, or internal IDs

## A06 — Vulnerable Components
- [ ] `npm audit` / `pip-audit` / `cargo audit` run — no high/critical CVEs
- [ ] Dependency lockfile committed and up to date
- [ ] Unused dependencies removed

## A07 — Authentication Failures
- [ ] Brute-force protection on login (rate limiting, CAPTCHA, account lockout)
- [ ] MFA available for privileged accounts
- [ ] Session invalidated on logout (server-side)
- [ ] Tokens have short TTL; refresh tokens rotate

## A08 — Software and Data Integrity
- [ ] CI/CD pipeline has integrity checks (signed commits, artifact verification)
- [ ] No `curl | sh` patterns in scripts or CI
- [ ] Dependency lockfiles committed

## A09 — Logging and Monitoring Failures
- [ ] All auth events logged (login, logout, failed attempts, token refresh)
- [ ] Logs do not contain passwords, tokens, or PII
- [ ] Log tampering is detectable (append-only storage or SIEM)
- [ ] Alerts exist for anomalous auth patterns

## A10 — Server-Side Request Forgery (SSRF)
- [ ] Any URL fetch from user input is validated against an allowlist
- [ ] No internal network access (metadata endpoints, internal services) reachable from user-supplied URLs
- [ ] DNS rebinding mitigated if applicable
