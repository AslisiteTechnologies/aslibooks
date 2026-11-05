# Next actions

## Current checkpoint

Branch `develop/phase-1-foundation`. Membership/team commit `406186c2be6b9a6f0312a4a366969649ad6fb67f` passed CI #228 and MongoDB #165. GST commit `76c998302801b78b91795e13bfc8dfd6fb68e94b` passed CI #230; MongoDB #167 exposed one catalog test fixture collision (same name changed the first paged result). The fixture name is fixed locally; publish and rerun the database workflow. Preserve and do not stage `ASLIBOOKS_CODEX_VISION_AND_EXECUTION.md`.

Latest GST unit test run passed 3/3. Typecheck, lint and build passed after the GST code and before the most recent documentation-only changes. GST product/invoice database integration and browser flows are pending CI. Tax-bearing invoice posting remains blocked. Local MongoDB is unavailable; previously the workspace test run passed 21 unit tests and skipped 67 DB tests, so those skips do not count as passes.

## Current implementation task

Publish the corrected GST product-fixture test on top of `76c998302801b78b91795e13bfc8dfd6fb68e94b`; verify both workflows, including MongoDB integration, and fix any failures. Then configure Better Auth email verification through an optional server-side provider adapter without weakening verified-email invitations; credentials remain deployment configuration and must not be committed. Proceed afterward with missing accounting controls and responsive E2E/release work.

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
- Better Auth verified email and password recovery delivery; currently no email provider is configured. Invitation email notification is also absent.
- Attachments metadata and secure storage policy; fiscal close checklist and period correction/reopen policy.
- Transfers, advances, cash refunds, export coverage and complete ledger export.
- Constrained AI explanation/draft extraction with explicit human approval and no direct posting capability.
- Tenant/role threat review, rate limits, session expiry UX, least-privilege runtime database role, staging/backup/restore/monitoring guide, desktop/mobile browser E2E and release checklist.

Never stage the owner-supplied vision file. Publish only to `develop/phase-1-foundation`, inspect the remote head before each expected-SHA update, never force push. Keep PR #1 draft, do not merge `main`, and do not deploy production.

