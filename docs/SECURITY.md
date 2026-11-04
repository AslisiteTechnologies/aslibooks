# Security and recovery

Better Auth verifies the cookie session. Resolve identity server-side and require an active organization membership on every scoped route. Owner/admin can manage the organization. Owner/admin/accountant can post. Viewer can read. Financial writes conditionally update the same membership document inside the posting transaction, including retries. Membership changes must update that document to preserve write conflicts.

## Ledger trust boundary

Journal schema hooks reject saving existing documents, query updates, replacements, single and mass deletes, document deletes and model bulk writes. Hooks cannot constrain raw driver access, collection methods, database administrators, aggregation writes or code that inserts fabricated entries. Service-only insertion, indexes, validated accounts and an audit event in the transaction are separate controls. Audit events themselves currently rely on application discipline.

Provision a runtime identity with find/insert access to journals and audit events. Grant collection-specific update permissions on mutable records only. Use a separate, time-limited maintenance identity for indexes, migrations and restores. Validate the actual grants on staging, including negative update/delete tests and transaction support. Retain independent backup and access logs. Restrict raw collection cleanup to disposable test databases and uniquely scoped fixtures.

## Remaining controls

Review cookie lifetime and HTTPS flags, allowed origins, CSRF on business routes, abuse limits, sensitive exception logging and dependency advisories before release. Separate credentials by environment. Keep secrets and financial payloads out of logs and support tickets. Defer uploads and AI processing until access control, validation, retention and consent are specified.

Restore an encrypted backup into a separate isolated database with restricted credentials. Compare tenant counts, journal/audit linkage, unique indexes, trial balance and sample reports as of the restore point. Record elapsed recovery time and data loss against owner-approved recovery objectives. Rehearse before production cutover.
