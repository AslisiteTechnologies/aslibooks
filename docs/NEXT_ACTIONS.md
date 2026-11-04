# Next actions

## Current checkpoint

Branch `develop/phase-1-foundation`. Latest published report checkpoint `86ed40f7869fdd3a88a78b553a103f589a2f3c17`; CI and MongoDB workflow state must be checked for newer commits. The local starter chart slice has passed full workspace tests with all MongoDB integration tests enabled, typecheck, lint, build and desktop/mobile browser smoke. The owner-supplied `ASLIBOOKS_CODEX_VISION_AND_EXECUTION.md` remains untracked and must never be staged.

## Next implementation task

Implement controlled opening balances after confirming the existing fiscal-period and journal interfaces. Treat the opening balance as one balanced, audited, idempotent journal in the open fiscal period, require elevated permission and explicit date/account/amount validation, prevent duplicate opening journals, and expose an owner workflow to review before posting. Do not allow a mismatch to be silently plugged; require debits equal credits and explain the opening equity account convention. Add integration coverage for replay, tenant isolation, inactive account, closed period, and transaction rollback.

## Verification and publish

For a disposable local replica set:

```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:37491/?replicaSet=aslibooksLocal'
$env:MONGODB_TEST_DB_NAME='aslibooks_test_<unique_name>'
pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

The Playwright smoke uses the shared Python runtime with `$env:PYTHONPATH="$env:TEMP\aslibooks-playwright-runtime"` and `$env:PLAYWRIGHT_BROWSERS_PATH="$env:TEMP\codex-aslibooks-browsers"`, then runs `python apps/web/e2e/chart.py`.

Commit verified slices on this branch. Publish without force; inspect the connected repository ref first because direct Git push has timed out in this environment. Check CI and MongoDB workflows on the exact resulting SHA before claiming them green. Never stage the owner-supplied vision document.

## Remaining MVP sequence

1. Opening balances and fiscal-year settings/period-close safeguards.
2. Contact edit/details, customer invoice draft and issue lifecycle with safe numbering, tax-free path first, balanced AR/income journals and audit.
3. Bills and expenses, receipts/payments and explicit allocations.
4. Receivable/payable aging, reconciliation and exports.
5. Reviewed GST data structures and deterministic supported calculations only.
6. Optional AI draft/explanation with explicit human approval.
7. Tenant/role/security review, full responsive E2E journeys, deployment instructions, backup/restore, monitoring and release readiness.

No production deploy, merge to `main`, live customer data, subscription purchase or legal/compliance claim is authorized.
