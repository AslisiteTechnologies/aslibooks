# Next actions

## Current checkpoint

Branch `develop/phase-1-foundation`. CSV export commit `cfd8655ed740250a9edd318faeb8d5ec5ba424b6` passed CI #220 and MongoDB #157. Banking commit `1a820651d08ed1d0c56926e0a3635db05cb76420` passed CI #222 and MongoDB #159. Dashboard commit `73e6a0cfeecd3a2cc355485dc739124429d0e43c` passed CI #224 but MongoDB #161 failed one assertion: the test’s Cash account had a non-starter code and was excluded from the 1000/1010 cash KPI. The fixture is corrected locally. Contact detail/edit API and UI improvements are also local. Typecheck/lint/build pass. Local Mongo is unavailable, so exact database and revised browser verification await the next commit’s Actions; do not count the failed dashboard test as passed. Preserve untracked `ASLIBOOKS_CODEX_VISION_AND_EXECUTION.md`; never stage it.

## Next implementation task after contact details

Continue GST-ready structures without compliance claims, AI draft/review (never autonomous posting), tenant/security review and release hardening. Keep tax-free posting until reviewed GST mechanics exist.

## Local verification commands

For a disposable replica set, run API integration suites serially because parallel MongoDB startup can time out test setup:

```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:37491/?replicaSet=aslibooksLocal'
$env:MONGODB_TEST_DB_NAME='aslibooks_test_<unique_name>'
pnpm --filter @aslibooks/api test --maxWorkers=1 src/routes/reports.integration.test.ts
pnpm --filter @aslibooks/api test --maxWorkers=1
pnpm --filter @aslibooks/accounting test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

Playwright uses `$env:PYTHONPATH="$env:TEMP\aslibooks-playwright-runtime"` and `$env:PLAYWRIGHT_BROWSERS_PATH="$env:TEMP\codex-aslibooks-browsers"`, then runs `python apps/web/e2e/chart.py`.

Publish only verified changes to `develop/phase-1-foundation`; use the connected GitHub workflow because direct `git push` timed out previously. Inspect the branch head before each ref update and never force. Check CI and MongoDB results on the exact commit SHA. Never stage the owner-supplied master document.

## Exact next verification commands

```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:37491/?replicaSet=aslibooksLocal'
$env:MONGODB_TEST_DB_NAME='aslibooks_test_<unique_name>'
pnpm --filter @aslibooks/api test --maxWorkers=1 src/routes/reports.integration.test.ts
pnpm --filter @aslibooks/api test --maxWorkers=1 src/routes/contacts.integration.test.ts
pnpm --filter @aslibooks/api test --maxWorkers=1
pnpm --filter @aslibooks/accounting test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
$env:PYTHONPATH="$env:TEMP\aslibooks-playwright-runtime"
$env:PLAYWRIGHT_BROWSERS_PATH="$env:TEMP\codex-aslibooks-browsers"
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" apps/web/e2e/chart.py
```

## Remaining MVP work

- Execute the added dashboard and contact-edit browser assertions when the local API/test replica is available.
- Richer invoice/credit-note print templates and complete responsive E2E coverage.
- Reviewed GST structures/calculations only after qualified review.
- Optional AI drafts/explanations with explicit approval.
- Tenant/role/security review, full responsive E2E coverage, deployment, backups/restores, monitoring and release readiness.

Do not deploy production, merge to `main`, use live customer data, purchase subscriptions or claim legal/tax compliance.

After dashboard/contact verification, commit only explicit report, contact, UI, test and documentation paths, publish using a non-forced expected-head ref update through GitHub, and verify CI/MongoDB on the exact resulting SHA before selecting GST-ready structures. Do not include the owner-supplied vision document.
