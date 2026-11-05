# Security and recovery

Better Auth verifies the cookie session. Resolve identity server-side and require an active organization membership on every scoped route. Owner/admin can manage the organization. Owner/admin/accountant can post. Viewer can read. Financial writes conditionally update the same membership document inside the posting transaction, including retries. Membership changes must update that document to preserve write conflicts.

## Ledger trust boundary

Journal schema hooks reject saving existing documents, query updates, replacements, single and mass deletes, document deletes and model bulk writes. Hooks cannot constrain raw driver access, collection methods, database administrators, aggregation writes or code that inserts fabricated entries. Service-only insertion, indexes, validated accounts and an audit event in the transaction are separate controls. Audit events themselves currently rely on application discipline.

Provision a runtime identity with find/insert access to journals and audit events. Grant collection-specific update permissions on mutable records only. Use a separate, time-limited maintenance identity for indexes, migrations and restores. Validate the actual grants on staging, including negative update/delete tests and transaction support. Retain independent backup and access logs. Restrict raw collection cleanup to disposable test databases and uniquely scoped fixtures.

## Remaining controls

Authentication POST requests are limited to 20 per 15 minutes using a MongoDB-backed fixed-window store shared across API instances; GET session checks are excluded. The store persists HMAC-hashed client keys, not raw IP values, and TTL-indexes expired counters. It depends on `BETTER_AUTH_SECRET` being stable across replicas. Express proxy trust must be configured only for known infrastructure hops so client keys cannot be spoofed. This is a basic abuse control, not a complete credential-stuffing defense; the two-instance MongoDB integration test must pass in CI before release.

Attachment storage uses private MongoDB GridFS and is accessible only through tenant-authorized API routes. Uploads accept PDF/PNG/JPEG signatures up to 10 MB and store metadata/audit records transactionally; the exact-commit MongoDB test covers cross-tenant access and content download. No malware scanning, retention/purge policy, account export/deletion workflow or at-rest encryption configuration has been verified; do not enable production uploads until those controls are chosen and tested. GridFS chunks can remain orphaned if database cleanup fails after an upload error; include orphan reconciliation in operations review.

Review cookie lifetime and HTTPS flags, allowed origins, CSRF on business routes, distributed abuse limits, sensitive exception logging and dependency advisories before release. Separate credentials by environment. Keep secrets and financial payloads out of logs and support tickets.

Restore an encrypted backup into a separate isolated database with restricted credentials. Compare tenant counts, journal/audit linkage, unique indexes, trial balance and sample reports as of the restore point. Record elapsed recovery time and data loss against owner-approved recovery objectives. Rehearse before production cutover.
