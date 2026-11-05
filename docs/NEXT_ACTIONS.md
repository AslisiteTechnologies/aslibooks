# Next actions

## Current checkpoint

Development branch head `74e2eb165355ba7beb266c5f068c62cde9f444ee`. AI report explanations passed CI #244/MongoDB #181; internal cash/bank transfers passed CI #246/MongoDB #183. Customer advance receipt and allocation workflow is in implementation and requires CI-backed integration verification. The owner-supplied vision document must remain unstaged.

## Current implementation task

Customer advances: liability account 2210, received-cash journal, same-customer invoice allocation, transactionally updated available balance, invoice payment state update, audit, idempotency, and review dialogs. Verify via MongoDB CI; local database integration tests are skipped without a replica set. Next implement vendor advances/refunds or attachments, browser coverage and release hardening. AI needs optional `OPENAI_API_KEY` and has no live-provider test. GST tax-bearing posting remains blocked pending qualified review; no live email delivery or production service is claimed.
## Exact verification commands

```powershell
pnpm --filter @aslibooks/api test -- src/accounting/gst.test.ts
pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:37491/?replicaSet=aslibooksLocal'
$env:MONGODB_TEST_DB_NAME='aslibooks_test_<unique_name>'
pnpm --filter @aslibooks/api test --maxWorkers=1 src/routes/transfers.integration.test.ts
pnpm --filter @aslibooks/api test --maxWorkers=1 src/routes/customerAdvances.integration.test.ts src/routes/accounts.integration.test.ts
pnpm --filter @aslibooks/api test --maxWorkers=1 src/routes/products.integration.test.ts src/routes/invoices.integration.test.ts
pnpm --filter @aslibooks/api test --maxWorkers=1
$env:PYTHONPATH="$env:TEMP\\aslibooks-playwright-runtime"
$env:PLAYWRIGHT_BROWSERS_PATH="$env:TEMP\\codex-aslibooks-browsers"
& "$env:USERPROFILE\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe" apps/web/e2e/chart.py
```

If local Mongo is unavailable, use exact-commit MongoDB Actions evidence. Do not claim local integration or browser tests passed unless executed.

## Remaining MVP work

- GST: validated HSN/SAC/rate inputs, expert-reviewed applicability and rate tables, journal mappings, tax-aware credits/purchases and proper printable tax documents. Keep unsupported cases blocked and avoid compliance claims.
- Production email-provider credentials and sender-domain verification; live delivery and Better Auth end-to-end verification.
- Attachments metadata and secure storage policy; fiscal period correction/reopen policy.
- Transfers, advances, cash refunds, attachments, constrained AI assistance, and release hardening.
- Constrained AI explanation/draft extraction with explicit human approval and no direct posting capability.
- Tenant/role threat review, rate limits, session expiry UX, least-privilege runtime database role, staging/backup/restore/monitoring guide, desktop/mobile browser E2E and release checklist.

Never stage the owner-supplied vision file. Publish only to `develop/phase-1-foundation`, inspect the remote head before each expected-SHA update, never force push. Keep PR #1 draft, do not merge `main`, and do not deploy production.

