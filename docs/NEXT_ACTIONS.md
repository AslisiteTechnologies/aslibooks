# Next actions

## Current checkpoint

Development branch head `10c6a1008d745771d475e1cba9c941fd2c7ba57b`. Email commit `67314132cbfa1a533a3912621a4ba1a04ca470fd` passed CI #234/MongoDB #171; fiscal checklist commit `d4ef5f3f9efab2941348852b9aedce218df40c43` passed CI #236, and its confirmation-test correction `aa6631c27ecdf3bff5962ca0e7050e5ff1cbbe56` passed CI #238/MongoDB #175. Optional Resend verification, password recovery and invitation notification are implemented in this worktree. Local checks passed: 28 tests; 67 MongoDB integration tests skipped due to no local replica set; typecheck, lint, build and `git diff --check` passed. The owner-supplied vision document must remain unstaged.

## Current implementation task

Email, fiscal close checklist, and GST review slices are verified through `10c6a1008d745771d475e1cba9c941fd2c7ba57b`. A user-facing GST review page and full paginated ledger export are being added; verify both and continue attachment policy, transfers, AI approval, and release hardening. Email provider credentials and sender-domain verification remain deployment prerequisites; no live delivery is claimed. The fiscal-close checklist and blocking/retry integration test are verified remotely. Tax-bearing invoices remain blocked pending expert review.
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

