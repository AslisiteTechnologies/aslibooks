# Next actions

## Current checkpoint

Published development branch head `c16ac0ae5e119caca1eea8577631271ec6b0e5e0`; CI #284 and MongoDB integration #221 passed. Browser run #4 identified a stale assertion expecting 23 instead of 25 starter accounts. The original workspace and its uncommitted owner work remain untouched; never stage the owner-supplied vision file.

## Current implementation task

Commit and publish the product unit/invoice snapshot work and corrected browser assertion. Local suite/typecheck/lint/build/script syntax passed; now verify CI, MongoDB catalog/invoice tests and the browser workflow on the exact SHA. Previous run #4 established compiled API and direct Vite startup work, then failed at the stale 23-account assertion. Fix subsequent browser failures and continue the next unfinished MVP milestone. Production uploads remain gated on retention, encryption/backup validation and malware-scanning decisions. AI requires optional `OPENAI_API_KEY` and has no live-provider test. GST tax-bearing posting remains blocked pending qualified review; no live email delivery or production service is claimed.
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

