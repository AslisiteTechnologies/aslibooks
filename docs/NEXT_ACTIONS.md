# Next actions

## Current checkpoint

Branch `develop/phase-1-foundation`. Customer receipt `b0f0f8793d3b4df244deefa3d7f0e939c9c3fb54` passed CI #200/MongoDB #137; vendor bill `1b96e1ccf424d81d5607c5faf095fde974cefd31` passed CI #202/MongoDB #139; vendor payment `ea27dd901c61452632bd647bd17f2709870fb870` passed CI #204/MongoDB #141; opening balances `d2794925635f7dc3aa0867737ed1f9d075ddd5e9` passed CI #206/MongoDB #143; settings `0b37dd02e819e2d5396aa683c6da7834ab53e702` passed CI #208/MongoDB #145; due-date/aging `3458330caa70f9bcf63fa84860452c84992e6f06` passed CI #210/MongoDB #147; printable invoices `e2b787e7aba03ff3e18155c5615137b6b3e70a71` passed CI #212/MongoDB #149. The printable invoice browser flow passed. Control-account reconciliation is implemented and verified by the full 84 API/5 accounting suite, typecheck/lint/build and 390px Playwright; next implement invoice/vendor credit notes with atomic journal, allocation, audit and idempotency behavior. Preserve untracked `ASLIBOOKS_CODEX_VISION_AND_EXECUTION.md`; never stage it.

## Next implementation task after aging summaries

Add and verify control-account reconciliation, then invoice and vendor credit workflows, exports and remaining security/release work. Keep tax-free posting until reviewed GST mechanics exist.

## Local verification commands

For a disposable replica set:

```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:37491/?replicaSet=aslibooksLocal'
$env:MONGODB_TEST_DB_NAME='aslibooks_test_<unique_name>'
pnpm test
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
pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
$env:PYTHONPATH="$env:TEMP\aslibooks-playwright-runtime"
$env:PLAYWRIGHT_BROWSERS_PATH="$env:TEMP\codex-aslibooks-browsers"
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" apps/web/e2e/chart.py
```

## Remaining MVP work

- Vendor payments, partial settlement, and bill status allocation lifecycle.
- Controlled opening balances and fiscal-year organization settings.
- Contact edit/details, richer invoice PDF templates, invoice and vendor credit notes.
- Cash/bank reconciliation and exports.
- Reviewed GST structures/calculations only after qualified review.
- Optional AI drafts/explanations with explicit approval.
- Tenant/role/security review, full responsive E2E coverage, deployment, backups/restores, monitoring and release readiness.

Do not deploy production, merge to `main`, use live customer data, purchase subscriptions or claim legal/tax compliance.
