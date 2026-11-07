# Security and recovery

Better Auth verifies the cookie session. Resolve identity server-side and require an active organization membership on every scoped route. Owner/admin can manage the organization. Owner/admin/accountant can post. Viewer can read. Financial writes conditionally update the same membership document inside the posting transaction, including retries. Membership changes must update that document to preserve write conflicts.

## Ledger trust boundary

Journal schema hooks reject saving existing documents, query updates, replacements, single and mass deletes, document deletes and model bulk writes. Hooks cannot constrain raw driver access, collection methods, database administrators, aggregation writes or code that inserts fabricated entries. Service-only insertion, indexes, validated accounts and an audit event in the transaction are separate controls. Audit events themselves currently rely on application discipline.

Provision a runtime identity with find/insert access to journals and audit events. Grant collection-specific update permissions on mutable records only. Use a separate, time-limited maintenance identity for indexes, migrations and restores. Validate the actual grants on staging, including negative update/delete tests and transaction support. Retain independent backup and access logs. Restrict raw collection cleanup to disposable test databases and uniquely scoped fixtures.

## Remaining controls

Authentication POST requests are limited to 20 per 15 minutes using a MongoDB-backed fixed-window store shared across API instances; GET session checks are excluded. The store persists HMAC-hashed client keys, not raw IP values, and TTL-indexes expired counters. It depends on `BETTER_AUTH_SECRET` being stable across replicas. Express proxy trust must be configured only for known infrastructure hops so client keys cannot be spoofed. The two-instance integration passed MongoDB CI #211. This is a basic abuse control, not a complete credential-stuffing defense.

Attachment storage uses private MongoDB GridFS and is accessible only through tenant-authorized API routes. Uploads accept PDF/PNG/JPEG signatures up to 10 MB and store metadata/audit records transactionally; exact-commit MongoDB tests cover cross-tenant access and content download. A tenant-scoped, role-gated NDJSON records export and gzip-tar full organization archive are available. The archive includes originals and checks attachment size/SHA-256, but is unencrypted and is not a point-in-time snapshot or backup. Organization deletion, malware scanning, retention/purge policy and verified at-rest encryption remain open; do not treat these controls as production-approved. GridFS chunks can remain orphaned if database cleanup fails after an upload error; include orphan reconciliation in operations review.

The API request handler, startup path, migration/index operator commands, and background authentication email delivery now emit only fixed error-event names and generic thrown-value types; regression tests confirm exception messages and stacks containing fake credentials, financial data, email recipients and reset tokens are omitted (source SHA `7afb605`). Continue reviewing cookie lifetime and HTTPS flags, allowed origins, CSRF on business routes, shared rate-limit behavior, dependency advisories, and logging at hosting/managed-database/email/AI provider layers before release. Separate credentials by environment. Keep secrets and financial payloads out of logs and support tickets.

The API requires an explicit `MONGODB_DB_NAME` and passes the same selected database to Mongoose and Better Auth. The development template uses `aslibooks_local` to avoid selecting an existing URI-default database. This is application configuration defense; Atlas credentials should still be limited to the intended non-production cluster and database.

Restore an encrypted backup into a separate isolated database with restricted credentials. Compare tenant counts, journal/audit linkage, unique indexes, trial balance and sample reports as of the restore point. Record elapsed recovery time and data loss against owner-approved recovery objectives. Rehearse before production cutover.


## Browser request origin checks

Organization business write routes reject unsafe browser requests whose `Origin` header is absent from the normalized `WEB_ORIGIN` allowlist, including opaque `null` origins. Safe GET/HEAD/OPTIONS requests and origin-less non-browser API clients remain supported; authentication retains its own trusted-origin configuration. This check reduces cross-site request forgery exposure for cookie-authenticated writes but does not replace secure cookie settings, HTTPS, session controls or route authorization. Focused allowlist/block/allow tests pass locally; production `WEB_ORIGIN` validation passed all six exact-SHA workflows at `24b592ea190415108e77247f4bbe3dda6103dc78` (CI #541/#542, MongoDB #476/#477, Browser #260/#261). Staging validation remains open.

## API response headers and AI data

The API applies `Cache-Control: no-store` to prevent shared/private browser caches from retaining authentication or tenant financial responses. It sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a restrictive `default-src 'none'` policy for API responses, `Referrer-Policy: strict-origin-when-cross-origin`, and disables camera, geolocation and microphone permissions. These API headers do not configure the separate static web host; repeat the appropriate controls at that edge and verify HTTPS/HSTS there. AI bill assistance sends only user-provided source text after explicit consent, is limited to 12,000 characters and 20 requests per IP per hour across API instances sharing the Mongo database and auth secret, and requests provider non-storage. No source text is written to app records. Review provider retention terms and network logging configuration before enabling it in a production environment.

## Production origin configuration

`WEB_ORIGIN` is required when `NODE_ENV=production`. Each comma-separated value must be a canonical HTTP(S) origin with no path, credentials, query or fragment; production values must use HTTPS. Localhost remains the development fallback only. This prevents production startup from silently trusting the localhost development origin.
