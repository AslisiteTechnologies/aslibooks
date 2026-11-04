# Next actions

## Current checkpoint

Branch `develop/phase-1-foundation`. The published starter-chart commit `11cdf6712cb1df0fd5e79038d3f00ff74f9a3b75` has green CI run #196 and MongoDB integration #133. The local invoice slice has passed all 75 API tests (including 2 MongoDB invoice tests), 5 accounting tests, workspace typecheck, lint, build and a Playwright customer-to-invoice-to-reports flow at 390px. Review and publish this slice, then start receipts/allocation. Preserve untracked `ASLIBOOKS_CODEX_VISION_AND_EXECUTION.md`; never stage it.

## Next implementation task after invoices

Build receipts and allocation as the next phase-2 vertical slice. Define immutable receipt records and an atomic posting/allocation path: debit cash/bank, credit receivables, allocate no more than the invoice's remaining amount, update invoice settlement state transactionally, audit, and support idempotent retries. Include partial/final payment, overpayment, cross-tenant, inactive bank account, closed period and rollback tests. Expose explicit human confirmation in the UI. Do not add GST calculations without verified rules and professional review.

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

- Receipts, payment allocation, invoice settlement and customer balance reconciliation.
- Vendor bills/expenses and vendor payments.
- Controlled opening balances and fiscal-year organization settings.
- Contact edit/details, due dates, invoice print/PDF and credit notes.
- Receivable/payable aging, cash/bank reconciliation and exports.
- Reviewed GST structures/calculations only after qualified review.
- Optional AI drafts/explanations with explicit approval.
- Tenant/role/security review, full responsive E2E coverage, deployment, backups/restores, monitoring and release readiness.

Do not deploy production, merge to `main`, use live customer data, purchase subscriptions or claim legal/tax compliance.
