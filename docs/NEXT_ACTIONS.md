# Next actions

## Current checkpoint

Branch `develop/phase-1-foundation`. Last published head `2b3ebf4a5f2490ea274ff64ef770beaf284ea597` has green CI #226 and MongoDB #163. The dashboard cash-fixture correction and contacts details/edit API tests passed in those workflows. This working tree adds member invitations, acceptance, role changes, suspension/reactivation, the Team UI, and DB integration coverage; none of this team work is committed or covered by CI yet. Local `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test` passed. The local test run reported 21 passing unit tests and 67 MongoDB integration tests skipped (no local replica set). Do not count the skipped tests as passing. Browser assertions for dashboard and contact edit remain unexecuted.

Preserve untracked `ASLIBOOKS_CODEX_VISION_AND_EXECUTION.md`; do not stage it. Invitations currently require an existing verified Better Auth account, but email verification delivery is not configured. The app also does not send invitation notification emails. Keep the verified-email guard; implement/verify a configurable provider as an operational prerequisite rather than weakening identity checks.

## Current implementation task

Finish and publish team/membership management. Run Actions on the exact new commit, inspect both workflows and fix any failures. Then add GST-ready product and invoice data structures (HSN/SAC, place-of-supply and explicit tax treatment snapshots) with deterministic validation/calculation tests, but keep tax-bearing invoice posting disabled until qualified accounting review supplies the supported rates and rules. Update the responsive forms and clear unsupported scenarios.

## Exact verification commands

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
git diff --check
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:37491/?replicaSet=aslibooksLocal'
$env:MONGODB_TEST_DB_NAME='aslibooks_test_<unique_name>'
pnpm --filter @aslibooks/api test --maxWorkers=1 src/routes/memberships.integration.test.ts
pnpm --filter @aslibooks/api test --maxWorkers=1
$env:PYTHONPATH="$env:TEMP\\aslibooks-playwright-runtime"
$env:PLAYWRIGHT_BROWSERS_PATH="$env:TEMP\\codex-aslibooks-browsers"
& "$env:USERPROFILE\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe" apps/web/e2e/chart.py
```

If local Mongo is still unavailable, use the MongoDB integration Actions run as the database test evidence, and record the browser E2E as not run rather than passing. Do not wait on CI without progressing independent work.

## Remaining MVP work

- Complete invitations lifecycle including configurable verified-email delivery and notification provider, without exposing secrets.
- Execute contact/dashboard/team browser flows at desktop and narrow viewport; test auth expiry and failure paths.
- GST-ready data structures and deterministic calculation tests; no compliance claim or tax posting until reviewed policy exists.
- Fiscal close checklist/reopening policy, attachments metadata, transfers/refunds/advances and complete report exports.
- Constrained AI explanation/draft extraction with explicit human approval, optional provider and no posting path.
- Tenant/role threat review, rate limits, verified-email/recovery/session-expiry UX, least-privilege runtime DB setup, staging/backup/restore/monitoring guide and release checklist.

Never stage the owner-supplied vision file. Publish only to `develop/phase-1-foundation`, inspect the current remote head before each expected-SHA update, never force push. Keep PR #1 draft, do not merge `main`, and do not deploy production.

