# Next actions

## Current checkpoint

Branch `develop/phase-1-foundation`. CSV export commit `cfd8655ed740250a9edd318faeb8d5ec5ba424b6` passed CI #220 and MongoDB #157. Bank statement import/matching/reconciliation is implemented locally: focused replica-set integration passed, full serial API suite passed 86 tests across 20 files, accounting passed 5 tests, web CSV test passed, typecheck/lint/build passed, and complete 390px E2E passed. Publish the verified banking slice next. Preserve untracked `ASLIBOOKS_CODEX_VISION_AND_EXECUTION.md`; never stage it.

## Next implementation task after banking workflow

Implement the real date-filtered accounting dashboard with ledger-derived revenue, expenses, receivables, payables and cash. Then continue contact edit/details, GST-ready structures without compliance claims, AI draft/review (never autonomous posting), tenant/security review and release hardening. Keep tax-free posting until reviewed GST mechanics exist.

## Local verification commands

For a disposable replica set, run API integration suites serially because parallel MongoDB startup can time out test setup:

```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:37491/?replicaSet=aslibooksLocal'
$env:MONGODB_TEST_DB_NAME='aslibooks_test_<unique_name>'
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

- Real dashboard with date-filtered accounting data.
- Contact details/edit workflow and richer invoice/credit-note print templates.
- Reviewed GST structures/calculations only after qualified review.
- Optional AI drafts/explanations with explicit approval.
- Tenant/role/security review, full responsive E2E coverage, deployment, backups/restores, monitoring and release readiness.

Do not deploy production, merge to `main`, use live customer data, purchase subscriptions or claim legal/tax compliance.

After browser verification, commit only explicit banking, test, UI and documentation paths, publish using a non-forced expected-head ref update through GitHub, and verify CI/MongoDB on the exact resulting SHA before selecting the dashboard task. Do not include the owner-supplied vision document.
