# Test evidence

## Previously verified remote history

- SHA `8d7a994e15bd4a4af3244411096113a1f8c1e41b`: CI #181 and MongoDB #118 succeeded at the time they were observed.
- SHA `1f7c76f0573918d88a3164c80548440e12cf26c1`: CI #183 and MongoDB #120 succeeded at the time they were observed.
- These historical runs do not verify the current local implementation.

## Local development verification

- MongoDB 7.0.16 replica set on loopback port 37491.
- API suite on `aslibooks_test_final_fence`: 11 files, 70 tests passed after adding the fiscal period posting fence, including auth, accounts, contacts, products, journals/reversals, membership authorization and close controls.
- Focused fiscal period HTTP integration on `aslibooks_test_periods_fix`: 1/1 passed for India fiscal-year creation, owner/admin-only close, audit and denial of subsequent posting.
- Workspace `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed after the posting-fence change and ESLint config rename. Lint checks apps and packages; it is no longer a zero-task script.
- Root `pnpm test`: 21 passed; 49 MongoDB integration tests skipped because no test DB environment was passed to the root process. Use the dedicated API command above for integration coverage.
- Playwright browser flow passed: signup, company onboarding, account create/rename, reload and 390px mobile navigation/archive. The test selector now handles MUI's required marker in accessible labels.
- Local API `/health` and Vite root returned HTTP 200 during browser verification.

## Remote CI

The latest known published development SHA is `f74dc1051725bd63707a1bcfc1d477a87ca48d50`. Check the exact new commit's CI and MongoDB workflow runs after publishing; do not infer their state from historical runs.
