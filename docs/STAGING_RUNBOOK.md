# Aslibooks staging runbook

This runbook prepares a non-production environment. It does not authorize deployment or prove that a staging exercise has happened. Use synthetic data only until the owner approves another test-data policy.

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
pnpm --filter @aslibooks/api db:ensure-indexes
```

`db:ensure-indexes` imports the registered Aslibooks Mongoose models and calls `createIndexes()` for each. It only ensures declared indexes; it does not drop indexes or mutate ledger documents. A duplicate-key failure is a stop condition: inspect the index and data safely, write and review a specific repair/migration, back up first, then retry. Do not use `syncIndexes()` as a production migration.

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

Use an encrypted, access-logged backup destination and a separate maintenance identity. Include the application database and both GridFS collections used for attachments (`aslibooks_attachments.files` and `aslibooks_attachments.chunks`, or their actual configured collection names). Protect Better Auth records and audit/journal data as financial data. Define recovery point and recovery time objectives with the owner before accepting a rehearsal.

1. Take a consistent MongoDB replica-set backup according to the managed provider’s documented procedure; record backup timestamp, database name, artifact digest and encryption/key reference without printing credentials.
2. Restore into a new isolated disposable database, never over the source. Keep API traffic disconnected from both source and restored copy.
3. Run `pnpm --filter @aslibooks/api db:ensure-indexes` against the restored copy.
4. Verify expected tenant and document counts, membership/journal/audit linkage, indexes, GridFS file/chunk pairing, a balanced trial balance, and sample GL/P&L/balance-sheet values against the backup cut-off.
5. Record restore duration and measured data loss against approved objectives. Delete the disposable restored copy under the approved test-data policy. A failed or absent restore rehearsal blocks production approval.

## Rollback and incident handling

Roll back the web and API artifacts as a compatible pair to the last reviewed SHA. Schema additions must remain backward-compatible for that rollback window. Never delete or rewrite posted journal entries to repair an application release; use the audited reversal/forward-correction workflow. Preserve redacted operational logs and database audit records. Escalate suspected tenant exposure or ledger corruption under the organization’s incident process; do not attempt a live data restore without owner approval.

## Current gate status

The repository includes these procedures, but no staging environment, staging secret configuration, hosted database grants validation, backup/restore rehearsal, alert exercise or rollback has been performed in this session. This runbook is prepared; staging-ready remains unverified until the checklist is executed and its evidence is recorded. See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md), [DEPLOYMENT.md](DEPLOYMENT.md), and [SECURITY.md](SECURITY.md).
