# Test evidence

## Previously verified remote history

- SHA `8d7a994e15bd4a4af3244411096113a1f8c1e41b`: CI #181 and MongoDB #118 succeeded at the time they were observed.
- SHA `1f7c76f0573918d88a3164c80548440e12cf26c1`: CI #183 and MongoDB #120 succeeded at the time they were observed.
- These historical runs do not verify the current local implementation.

## Local development verification

- MongoDB 7.0.16 replica set on loopback port 37491.
- Workspace `pnpm test` with Turbo MongoDB variables passed through on `aslibooks_test_workspace_journals`: 71 API tests and 5 accounting package tests passed; all MongoDB integration tests ran against the isolated replica-set database.
- Focused fiscal period HTTP integration on `aslibooks_test_periods_fix`: 1/1 passed for India fiscal-year creation, owner/admin-only close, audit and denial of subsequent posting.
- Workspace `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed. Lint checks apps and packages; it is no longer a zero-task script. Lazy route chunks keep the largest bundle under 500 kB.
- Playwright browser flow passed: signup, company onboarding, account create/rename, reload, 390px mobile navigation/archive, manual journal entry, balance review, explicit confirmation and posted line detail. The test selector handles MUI's required marker in accessible labels.
- Manual journal API integration passed for tenant scope, session-derived actor, balanced validation, idempotent posting, detail read and reversal audit.
- Local API `/health` and Vite root returned HTTP 200 during browser verification.

## Remote CI

Published fiscal-period checkpoint `2f0125ad65944878732ba29b150bd56b72b38c44`: CI run #188 and MongoDB integration #125 both completed successfully. The local manual-journal slice remains unpublished; check both workflows for its own SHA after commit.
