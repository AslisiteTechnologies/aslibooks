# Aslibooks staging runbook

This runbook prepares a non-production environment. It does not authorize deployment or prove that a staging exercise has happened. Use synthetic data only until the owner approves another test-data policy.

## Lowest-cost staging shape (not provisioned)

Use one small always-on API service and static web hosting, backed by a **new synthetic-only database named `aslibooks_staging_synthetic`**. Never reuse `aslibooks_website_engine`, `aslibooks_website_engine_staging`, `test`, or any other existing database shown in the owner’s Atlas project. Create a new staging-only database user restricted to that exact database; use separate credentials, auth secret and host allowlist from development and production. The existing Atlas cluster may host this database only if the owner accepts that staging shares its cluster’s infrastructure; a separate cluster provides stronger isolation and is not included in this cost-minimum option.

As of 2026-11-07, a reference low-cost shape is a static site plus one paid, always-on Render web service for the Node API (the current smallest listed service is $6/month), with an existing Atlas free cluster only for the new synthetic database. This is an estimate, not a purchase or a provider selection. Do not use a sleeping free API service for a staging rehearsal: Render documents that free web services can spin down and are not for production use. Render’s shared outbound IP ranges can be broad; Atlas must allow only the documented service-region ranges if the owner accepts that exposure, never `0.0.0.0/0`. If that is unacceptable, choose a host with a dedicated static egress IP and re-estimate cost before provisioning. [Render pricing](https://render.com/pricing) · [Render free-service limits](https://render.com/docs/free) · [Render outbound ranges](https://render.com/docs/outbound-ip-addresses).

Keep a monthly backup line item out of the minimum plan only if a manually initiated database-scoped encrypted `mongodump` is exported to an already-owned, access-controlled storage location and a restore is rehearsed. If the staging DB shares the owner’s Atlas cluster, do not use a cluster-wide snapshot that would also copy unrelated existing databases. Pause/drain writes to the synthetic staging database and dump only `aslibooks_staging_synthetic`. Do not depend on Atlas M0 backups: the current optional M0 snapshot offer is a gradual private preview, requires a payment method, costs up to $3/month, retains only four daily snapshots and does not support on-demand snapshots. It is cluster-level and therefore inappropriate for a synthetic-only backup on a shared cluster. Confirm availability/current terms in the owner’s Atlas account; do not enable it without spending approval. [Atlas free-cluster backup limitations](https://www.mongodb.com/docs/atlas/backup/cloud-backup/free-cluster-backup/).

### Credential and privilege boundary

- Use Atlas database-user credentials, not an Atlas console/API key, in the API. Scope the user to the new staging database and, where supported, to the intended cluster. Atlas documents database-scoped and custom-role access. Do not grant `readWriteAnyDatabase`, `dbAdminAnyDatabase`, `root`, or access to all databases.
- A short-lived maintenance user runs index creation, migrations, and restore verification. Revoke it after the operation. The deployed API must not run `db:ensure-indexes` or migrations.
- Before finalizing a custom runtime role, enumerate the collections and operations exercised by the exact build. Grant collection-scoped `find`/`insert` and only the specific `update`/`remove` operations the application needs; journals and audit records should be insert/read-only to the runtime role. Startup no longer creates the auth/AI rate-limit indexes, and Mongoose `autoIndex` is disabled for `NODE_ENV=production`; `db:ensure-indexes` now prepares model and rate-limit indexes before deployment. Better Auth index behavior and the full candidate role still need validation under staging grants. This is an **open staging gate**: do not claim least-privilege verified from a role design alone. MongoDB supports collection-scoped custom actions, but all required operations must be proven in staging. [Atlas custom roles](https://www.mongodb.com/docs/atlas/security-add-mongodb-roles/) · [collection-level access control](https://www.mongodb.com/docs/manual/core/collection-level-access-control/).
- Validate restrictions negatively: the runtime credential must fail reads/writes against every other existing database, fail journal update/delete and audit update/delete, and pass normal signup, auth throttling, transaction posting, reports, attachments, and logout against the synthetic database. Keep the maintenance credential unavailable to the runtime process.

### Deploy and verify one exact revision

1. Record the intended Git SHA, clean-worktree result, CI/MongoDB/Browser run URLs for that SHA, and web/API artifact hashes in the release record. Refuse deployment if the deployed SHA is not the reviewed SHA or any required check is red/queued.
2. Build both API and web from that SHA with a frozen lockfile. Store artifacts immutably and deploy the API and matching static web artifact as a compatible pair. Inject secrets through the host secret manager; never place them in build arguments, Git, logs, or screenshots.
3. Apply reviewed indexes/migrations against the exact `aslibooks_staging_synthetic` name using the temporary maintenance identity, then revoke it. Verify the running service reports the recorded SHA through provider deployment metadata; the application currently has no version endpoint, so use that immutable deployment metadata and a saved artifact digest rather than inferring a SHA from `/health`.
4. Exercise the synthetic golden scenario and security checks below. Save URLs, timestamps, counts, checksums and sanitized logs. A successful deployment without this evidence is not staging-ready.
5. For rollback, select the last verified compatible API/web SHA pair, redeploy both immutable artifacts, and recheck readiness, login, tenant scoping, journal balance and reports. Do not roll back a destructive schema change; keep migrations additive and backward-compatible across the rollback window.

### Monitoring and recovery targets

Staging should alert an owner-controlled destination on failed `/health/ready` probes, sustained API 5xx/latency, MongoDB connection or transaction failures, auth throttle spikes, and missing/failed backup age. Use host/database metrics and sanitized logs; never log credentials, cookies, request bodies, customer names or financial values. Run a deliberate synthetic outage and alert-delivery check. The repository has health/readiness endpoints but no built-in metrics or alert routing; monitoring is an environment configuration and remains unverified until exercised. The owner must set acceptable RPO/RTO before production; staging may measure restore duration but cannot choose those business targets.

## Runtime configuration

Build with Node 24 LTS and pnpm 10.18.0. Configure the API environment through the hosting secret manager (never commit `.env` files):

| Variable | Staging requirement |
| --- | --- |
| `MONGODB_URI` | Private MongoDB replica-set URI over TLS; separate database and credentials from every other environment |
| `MONGODB_DB_NAME` | Dedicated staging database name |
| `BETTER_AUTH_SECRET` | Unique high-entropy secret, stable across API replicas; do not reuse local or production values |
| `BETTER_AUTH_URL` | Canonical HTTPS API origin |
| `WEB_ORIGIN` | Exact canonical HTTPS web origin, without a path; comma-separate only explicitly configured origins |
| `PORT` | API listener port assigned by the runtime |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional; configure a verified staging sender before testing live email flows |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Optional; leave absent unless consent, provider terms, retention and spending limits are reviewed |

`VITE_API_URL` is a web build-time setting and must point to the staging API. Serve `apps/web/dist` through an HTTPS static host. Configure the edge to prevent framing, sniffing, and caching of authenticated app content; verify HTTPS and HSTS there. Set `NODE_ENV=production` for the API to exercise production origin validation.

## Index and schema rollout

Mongoose model schemas declare indexes. Apply additions before deploying code that depends on them, using a short-lived maintenance credential with create-index rights, and the same target database name as the API:

```sh
pnpm install --frozen-lockfile
export ASLIBOOKS_INDEX_DATABASE="$MONGODB_DB_NAME"
pnpm --filter @aslibooks/api db:ensure-indexes
```

`db:ensure-indexes` requires `ASLIBOOKS_INDEX_DATABASE` to exactly match `MONGODB_DB_NAME` and checks this before opening a database connection. It imports the registered Aslibooks Mongoose models and calls `createIndexes()` for each, then creates TTL indexes for auth and AI rate-limit collections. It only ensures declared indexes; it does not drop indexes or mutate ledger documents. A duplicate-key failure is a stop condition: inspect the index and data safely, write and review a specific repair/migration, back up first, then retry. Do not use `syncIndexes()` as a production migration.

The API now includes a versioned forward-only runner in `apps/api/src/migrations/runner.ts`, with migration declarations in `apps/api/src/migrations/registry.ts`. No data migration is required by the current release, so the registry is deliberately empty and the command records no applied versions. Each future migration must have a date-prefixed unique ID, a description, a restart-safe `up` operation, and an isolated replica-set integration rehearsal. The runner applies migrations in ID order, records successful versions in `aslibooks_schema_migrations`, skips recorded versions, rejects unknown historical versions, and permits safe retry after an operation stops before version recording. It never implements automatic down migrations: correct data forward with a reviewed migration or use the application’s linked journal reversal for financial postings.

Run the command with a short-lived maintenance identity and explicitly confirm the exact database name:

```sh
export ASLIBOOKS_MIGRATION_DATABASE="$MONGODB_DB_NAME"
pnpm --filter @aslibooks/api db:migrate
```

Run one migration operator per target database at a time. Keep old and new code compatible during rolling deploys; remove obsolete fields or indexes only in a separately reviewed later release. A registry/code mismatch, migration error, or unreviewed duplicate-key condition is a stop condition; inspect the database and logs before retrying.

Build and local quality gate:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm audit --audit-level=high
```

The database must be a disposable replica set for integration tests. Never run integration tests against staging or production data.

## Pre-rollout verification

1. Deploy the exact reviewed commit SHA to staging and record the API/web artifact digests.
2. Run the index command above with the maintenance identity; retain its exit status and output. Revoke that identity after migration work.
3. Start the API with its restricted runtime identity. Verify `GET /health` returns 200 and `GET /health/ready` returns 200 only while MongoDB is connected; verify it returns 503 during a controlled staging database outage.
4. Verify HTTPS cookie round trips, exact-origin CORS and unsafe-origin rejection, login/registration, tenant scoping, role denial, transaction support and the application’s required database indexes.
5. Complete the synthetic golden business month and compare posted journal debits/credits, source-document settlements, bank reconciliation and statements. Do not use real customer financial data.
6. Exercise dashboard, logs and alerts. At minimum monitor readiness failures, API 5xx and latency, MongoDB availability/replication/transaction aborts, disk capacity, authentication throttling, and backup age/failure. Redact authorization headers, cookies, passwords, provider credentials and financial request bodies. The app has health endpoints but no built-in metrics or alerting integration; configure these at the hosting and database layers.
7. Upload a synthetic attachment only after the owner has approved malware scanning and retention/purge handling; verify private storage, authorized download, size limits and cleanup behavior.

## Backup and restore rehearsal

Use an encrypted, access-logged backup destination and a separate maintenance identity. For a staging database sharing Atlas with other owner databases, take a database-scoped dump of `aslibooks_staging_synthetic` only; do not take or export a cluster-wide snapshot. Pause/drain API writes to staging for the dump window so this database-only dump is coherent. A dedicated staging cluster can use its provider’s documented cluster snapshot if that cluster contains staging data only. Include both GridFS collections (`aslibooks_attachments.files` and `aslibooks_attachments.chunks`) within the application database. Protect Better Auth records and audit/journal data as financial data. Define recovery point and recovery time objectives with the owner before accepting a rehearsal.

1. Use MongoDB Database Tools `mongodump`/`mongorestore` compatible with the target server version. Store the connection URI in a protected tools config file (permissions for the operator only); never put passwords in shell history or command-line arguments. For example, with a private YAML config file containing `uri: "<staging connection URI>"` and mode `0600`:

   ```sh
   mongodump --config "$MONGODB_TOOLS_CONFIG" --db aslibooks_staging_synthetic --archive="$BACKUP_FILE" --gzip
   sha256sum "$BACKUP_FILE"
   ```

   `mongodump --db` limits output to that database, and `--archive --gzip` creates a single compressed archive. Verify this command-line option is supported by the installed Database Tools version. Encrypt the archive with the owner-approved encryption tool before transfer; store its key separately. Record both the pre-encryption and encrypted archive digests, backup timestamp, exact database name, and key reference without printing credentials. See [mongodump archive and config-file options](https://www.mongodb.com/docs/database-tools/mongodump/).
2. Restore only into a new empty isolated database, never over the source. Keep the API disconnected from source and restored copy. Use a restore-only config URI scoped to the new target database and a different restricted maintenance identity. Example (source archive namespace renamed into the empty restore DB):

   ```sh
   # Decrypt the backup to a protected temporary file first; never restore from the encrypted bytes.
   mongorestore --config "$RESTORE_TOOLS_CONFIG" --gzip --archive="$DECRYPTED_BACKUP_FILE" \
     --nsFrom='aslibooks_staging_synthetic.*' --nsTo="$RESTORE_DB_NAME.*" --stopOnError
   ```

   The restore config URI must connect to the new target database and the maintenance identity must have restore privileges only there. Do not pass `--drop`; the target must be new and empty. Securely remove the decrypted temporary file after the restore. See [mongorestore archive and namespace options](https://www.mongodb.com/docs/database-tools/mongorestore/).
3. Set both `MONGODB_DB_NAME` and `ASLIBOOKS_INDEX_DATABASE` to the restore copy’s exact database name, then run `pnpm --filter @aslibooks/api db:ensure-indexes` with the maintenance identity.
4. Verify expected tenant and document counts, membership/journal/audit linkage, indexes, GridFS file/chunk pairing, a balanced trial balance, and sample GL/P&L/balance-sheet values against the backup cut-off.
5. Record dump/restore durations and measured data loss against approved objectives. Delete the disposable restored copy under the approved test-data policy. A failed or absent restore rehearsal blocks production approval.

## Rollback and incident handling

Roll back the web and API artifacts as a compatible pair to the last reviewed SHA. Schema additions must remain backward-compatible for that rollback window. Never delete or rewrite posted journal entries to repair an application release; use the audited reversal/forward-correction workflow. Preserve redacted operational logs and database audit records. Escalate suspected tenant exposure or ledger corruption under the organization’s incident process; do not attempt a live data restore without owner approval.

## Current gate status

The repository includes these procedures, but no staging environment, staging secret configuration, hosted database grants validation, backup/restore rehearsal, alert exercise or rollback has been performed in this session. This runbook is prepared; staging-ready remains unverified until the checklist is executed and its evidence is recorded. See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md), [DEPLOYMENT.md](DEPLOYMENT.md), and [SECURITY.md](SECURITY.md).
