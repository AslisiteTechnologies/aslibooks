# Next actions

## Current checkpoint

Branch `develop/phase-1-foundation`. Customer receipt commit `b0f0f8793d3b4df244deefa3d7f0e939c9c3fb54` is published; CI #200 and MongoDB #137 passed. Vendor bill API/UI passed 79 API/5 accounting tests, focused regression tests, workspace typecheck/lint/build, and full Playwright. Publish the verified bill slice, verify CI, then implement vendor payment allocation. Preserve untracked `ASLIBOOKS_CODEX_VISION_AND_EXECUTION.md`; never stage it.

## Next implementation task after receipts

Publish the vendor bill checkpoint. Next implement vendor payment allocation against posted bills and reconcile both accounts-payable and cash control balances. Keep tax-free posting until reviewed GST mechanics exist.

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

## Remaining MVP work

- Vendor payments, partial settlement, and bill status allocation lifecycle.
- Controlled opening balances and fiscal-year organization settings.
- Contact edit/details, invoice due dates, print/PDF and credit notes.
- Receivable/payable aging, cash/bank reconciliation and exports.
- Reviewed GST structures/calculations only after qualified review.
- Optional AI drafts/explanations with explicit approval.
- Tenant/role/security review, full responsive E2E coverage, deployment, backups/restores, monitoring and release readiness.

Do not deploy production, merge to `main`, use live customer data, purchase subscriptions or claim legal/tax compliance.
