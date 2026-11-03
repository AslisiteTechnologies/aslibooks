# Organization API integration tests

The tests in `apps/api/src/routes/organizations.integration.test.ts` exercise HTTP routes and real MongoDB transaction behavior. They are **opt-in** and are skipped in normal CI because no test MongoDB service is configured. They use a fake identity resolver strictly within the test harness; this does not validate Better Auth session cookies.

## Safe setup
Use a dedicated, disposable MongoDB Atlas **test** cluster or local MongoDB replica set. Never point these tests at production or at a database with real business data.

Set `MONGODB_TEST_URI` to the test replica-set connection string and `MONGODB_TEST_DB_NAME` to a unique name starting with `aslibooks_test_`, such as `aslibooks_test_ci`. Never commit credentials. Run `pnpm --filter @aslibooks/api test`.

Covered: anonymous denial, atomic owner creation, duplicate slug handling, membership-scoped listing and suspended memberships.

Not covered: real Better Auth signup/login, cookies, CSRF, email verification, session expiry, concurrency, transaction rollback failure injection or full ledger tenant isolation. These remain release blockers.
