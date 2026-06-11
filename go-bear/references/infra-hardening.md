# Infrastructure Hardening Checklist

## IAM and access control
- [ ] Principle of least privilege on all IAM roles and service accounts
- [ ] No wildcard (`*`) permissions in production IAM policies
- [ ] Service accounts have only the permissions they need, reviewed quarterly
- [ ] MFA required for all human accounts with production access

## Storage
- [ ] No public S3 buckets (unless intentional CDN with read-only objects)
- [ ] Bucket policies reviewed — no `s3:*` grants
- [ ] Sensitive data encrypted at rest (SSE-S3 minimum, SSE-KMS preferred)

## Database
- [ ] Database not publicly accessible (no public IP, VPC-only)
- [ ] Database credentials rotated and stored in secrets manager
- [ ] Automated backups enabled with tested restore procedure
- [ ] SSL/TLS enforced for all database connections

## Compute
- [ ] SSH key-based authentication only — no password auth
- [ ] SSH access restricted to VPN or bastion host
- [ ] OS packages up to date; automated security patch schedule in place
- [ ] No unnecessary ports open on security groups / firewall rules

## Network
- [ ] Firewall allows only required ports (80, 443 inbound; deny all else)
- [ ] Internal services not exposed to the internet
- [ ] VPC flow logs enabled
- [ ] WAF in place if the application is internet-facing

## Secrets
- [ ] No hardcoded credentials in code, config files, or CI pipelines
- [ ] Secrets stored in a managed secrets service (Vault, AWS SSM, GCP Secret Manager)
- [ ] Secret rotation automated or on a documented schedule
- [ ] Access to secrets is logged and auditable

## Logging and monitoring
- [ ] Centralized log aggregation (CloudWatch, Datadog, ELK)
- [ ] Alerts on: failed logins, IAM changes, security group changes, high error rate
- [ ] Log retention policy defined (minimum 90 days for security logs)
- [ ] Incident response runbook exists
