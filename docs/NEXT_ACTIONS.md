# Next actions

## Current checkpoint

Branch `develop/phase-1-foundation`. Published invoice commit `65435336d9fa8e2f479465d0001ae65da902bad9` has green CI #198 and MongoDB #135. The local receipt slice has passed the full 77 API/5 accounting tests with MongoDB, workspace typecheck/lint and Playwright flow; confirm final build, then review and publish. Preserve untracked `ASLIBOOKS_CODEX_VISION_AND_EXECUTION.md`; never stage it.

## Next implementation task after receipts

Build vendor bills and expense capture next. Add a tenant-scoped draft/issue lifecycle, safe fiscal-year numbering, vendor and expense/asset account validation, immutable bill snapshots, atomic payable/expense journal and audit, idempotent posting, and a review-before-post UI. Then support vendor payment allocations and reconcile both control accounts. Keep tax-free posting until reviewed GST mechanics exist.

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

- Vendor bills/expenses and vendor payments.
- Controlled opening balances and fiscal-year organization settings.
- Contact edit/details, invoice due dates, print/PDF and credit notes.
- Receivable/payable aging, cash/bank reconciliation and exports.
- Reviewed GST structures/calculations only after qualified review.
- Optional AI drafts/explanations with explicit approval.
- Tenant/role/security review, full responsive E2E coverage, deployment, backups/restores, monitoring and release readiness.

Do not deploy production, merge to `main`, use live customer data, purchase subscriptions or claim legal/tax compliance.
