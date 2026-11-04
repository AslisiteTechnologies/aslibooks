# Test evidence

## Verified remote baseline

- SHA `8d7a994e15bd4a4af3244411096113a1f8c1e41b`: CI #181 success and MongoDB #118 success.
- SHA `1f7c76f0573918d88a3164c80548440e12cf26c1`: CI #183 success and MongoDB #120 success. This commit fixes posted-journal deletion bypasses and cross-operation idempotent reversal replay.
- Neither remote run verifies local account changes.

## Local account slice

- Replica set: MongoDB 7.0.16, loopback port 37491.
- `pnpm --filter @aslibooks/api test -- src/routes/accounts.integration.test.ts`: 4/4 tests passed after correcting the immutable default field.
- All API suites against `aslibooks_test_chart_full_1104`: 65/65 tests passed.
- Workspace typecheck and build passed before the final four-line schema correction. Run again on the resulting tree before commit.
- Earlier full workspace test skipped 44 MongoDB cases because the MONGODB test environment was not passed to the root process. Do not count this as integration coverage. Dedicated full API suite above ran with test environment configured.
- Browser Playwright E2E has not passed. Previous server helper timed out before API startup. Diagnosing launcher and env propagation remains the first action.
- `pnpm lint` reports zero tasks. It does not constitute lint evidence.
