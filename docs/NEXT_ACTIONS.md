# Next actions

## Current checkpoint

Published development branch head `08faceae41493b7bcea52f8724153096bebbb12b`; CI #288 and MongoDB integration #225 passed. Browser runs #7/#8 passed Name after the correction but found an Email selector race. Follow-up form scoping is in progress locally. Original workspace uncommitted owner work remains untouched; never stage the owner-supplied vision file.

## Current implementation task

Publish the form-scoped contact field fix and rerun CI, MongoDB and browser Actions on its exact commit. Browser workflows now pass startup, sign-up, organization creation, starter accounts, opening balances, settings, account create/edit/archive and contact customer creation/edit before failing while setting up a vendor. Continue fixing E2E failures until the full flow passes, then begin the next unfinished MVP milestone. Production uploads remain gated on retention, encryption/backup validation and malware-scanning decisions. AI requires optional `OPENAI_API_KEY` and has no live-provider test. GST tax-bearing posting remains blocked pending qualified review; no live email delivery or production service is claimed.
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
- Transfers and customer/vendor advances are implemented; cash refund of an unallocated customer advance is in progress. Attachments and release hardening remain.
- Constrained AI explanation/draft extraction with explicit human approval and no direct posting capability.
- Tenant/role threat review, rate limits, session expiry UX, least-privilege runtime database role, staging/backup/restore/monitoring guide, desktop/mobile browser E2E and release checklist.

Never stage the owner-supplied vision file. Publish only to `develop/phase-1-foundation`, inspect the remote head before each expected-SHA update, never force push. Keep PR #1 draft, do not merge `main`, and do not deploy production.


