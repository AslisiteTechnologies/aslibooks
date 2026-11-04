# Test evidence

## Previously verified remote history

- SHA `8d7a994e15bd4a4af3244411096113a1f8c1e41b`: CI #181 and MongoDB #118 succeeded at the time they were observed.
- SHA `1f7c76f0573918d88a3164c80548440e12cf26c1`: CI #183 and MongoDB #120 succeeded at the time they were observed.
- These historical runs do not verify the current local implementation.

## Local development verification

- MongoDB 7.0.16 replica set on loopback port 37491.
- Workspace `pnpm test` with Turbo MongoDB variables passed through on `aslibooks_test_invoice_full`: 75 API tests across 14 files and 5 accounting package tests passed; all MongoDB integration tests ran against the isolated replica-set database.
- Focused fiscal period HTTP integration on `aslibooks_test_periods_fix`: 1/1 passed for India fiscal-year creation, owner/admin-only close, audit and denial of subsequent posting.
- Workspace `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed. Lint checks apps and packages; it is no longer a zero-task script. Lazy route chunks keep the largest bundle under 500 kB.
- Playwright browser flow passed: signup, company onboarding, account create/rename, reload, 390px mobile navigation/archive, manual journal entry, balance review, explicit confirmation, posted line detail, trial balance and general ledger. The test selector handles MUI's required marker in accessible labels.
- Manual journal API integration passed for tenant scope, session-derived actor, balanced validation, idempotent posting, detail read and reversal audit.
- Reports integration passed with exact trial balance debit/credit totals and a three-page general ledger running balance; report reads require ledger permission and tenant scope.
- Seeded financial statements reconcile exactly: total income ₹35.00, total expenses ₹12.00, net earnings ₹23.00, assets ₹123.00, equity ₹100.00 plus current earnings ₹23.00.
- Local API `/health` and Vite root returned HTTP 200 during browser verification.

## Remote CI

Published reports checkpoint `86ed40f7869fdd3a88a78b553a103f589a2f3c17`: CI run #194 and MongoDB integration #131 both completed successfully.

- Starter chart integration passed: 23 seeded accounts, preserves customized existing codes, role/forged-field denial, repeated idempotent request and audit event.
- Workspace full tests passed with MongoDB enabled after starter chart: 73 API tests and 5 accounting tests; pnpm typecheck, pnpm lint and pnpm build passed.
- Browser smoke passed after starter chart: signup, onboarding, chart seeding, account create/rename/archive, narrow viewport navigation, manual journal approval, trial balance, P&L, balance sheet and general ledger.

- Published starter chart commit 11cdf6712cb1df0fd5e79038d3f00ff74f9a3b75: CI #196 and MongoDB integration #133 succeeded.
- Invoice API slice: focused MongoDB integration passed 2/2 for customer/tenant restrictions, draft-only state, tax rejection, fiscal-year numbering, balanced AR/income journal, atomic audit, idempotent replay, issued-document immutability and rollback when control accounts are unavailable.
- After invoices, workspace `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed. Build produced a separate 4.92 kB SalesScreen chunk; main chunk is 484.63 kB.
- Playwright flow passed on the current invoice UI: signup, onboarding, starter chart, account lifecycle, customer and service creation, service invoice draft and explicit issue, 390px navigation, manual journal approval, trial balance, P&L (₹50.00 invoice revenue), balance sheet and general ledger.
- Invoice changes are not yet committed or published; run CI and MongoDB integration on the new exact SHA before recording it as green.
