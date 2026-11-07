# Local development

Prerequisites: Node.js 24 LTS, pnpm 10.18.0, and a disposable MongoDB replica set for database-backed accounting tests and financial workflows.

1. Enable Corepack with `corepack enable`, then run `pnpm install` from the repository root.
2. Copy `.env.example` to `apps/api/.env` and configure local-only values. Set `MONGODB_URI`, `MONGODB_DB_NAME`, `BETTER_AUTH_SECRET` (at least 32 random characters), `BETTER_AUTH_URL=http://localhost:4000`, and `WEB_ORIGIN=http://localhost:5173`. Never reuse production credentials.
3. Start the API and web client with `pnpm dev`. The web client is normally at `http://localhost:5173`, the API at `http://localhost:4000`.
4. Check `GET /health` for process liveness and `GET /health/ready` for MongoDB readiness.
5. Run `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build`.

The ordinary `pnpm test` command skips opt-in database integrations unless both `MONGODB_TEST_URI` and `MONGODB_TEST_DB_NAME` are set. The test DB name must match `aslibooks_test_*`; use a disposable replica set only. Follow [integration testing](integration-testing.md) for setup and teardown expectations. The Browser E2E workflow provisions its own disposable MongoDB replica set and browser.

Financial posting is implemented and available in this development MVP. Do not use production financial records for development or tests. Review [accounting rules](ACCOUNTING_RULES.md), [security boundaries](SECURITY.md), and the [implementation status](IMPLEMENTATION_STATUS.md) before changing ledger behavior. Production operation has not been verified.
