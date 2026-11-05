# Aslibooks

Aslibooks is an INR-first, multi-tenant accounting web application for Indian small businesses. It uses a React/MUI client, an Express/TypeScript API, Better Auth, MongoDB transactions, and integer paise for ledger amounts.

## Current capabilities

- Account registration, organization setup, membership invitations and role-based access.
- Account catalog, opening balances, manual journals, reversals, fiscal periods and close review.
- Customer/vendor records, products/services, sales invoice drafts and issue, receipts, bills, vendor payments, advances and credit notes.
- Bank statement import and reconciliation, cash transfers, customer/vendor statements, trial balance, general ledger, profit and loss, balance sheet, aging, dashboard and CSV exports.
- Optional AI explanation of explicitly consented aggregate report totals. AI is informational and cannot post accounting entries.

This is an MVP under active development, not a production-ready service. Tax-bearing invoices are held as drafts; rates and classifications are user supplied and have not been reviewed for compliance. There is no GST filing integration, native mobile app, verified staging deployment, backup restore rehearsal, production monitoring, or live email-provider validation. See [implementation status](docs/IMPLEMENTATION_STATUS.md) and [release checklist](docs/RELEASE_CHECKLIST.md).

## Local development

Prerequisites: Node.js 22, pnpm 10.18.0, and a MongoDB replica set (transactions are required for financial writes).

1. Run `corepack enable` and `pnpm install` from the repository root.
2. Copy `.env.example` to `apps/api/.env`. Configure a disposable replica-set URI, database name, a unique random `BETTER_AUTH_SECRET` of at least 32 characters, `BETTER_AUTH_URL=http://localhost:4000`, and `WEB_ORIGIN=http://localhost:5173`. Keep real credentials out of Git.
3. Run `pnpm dev` and open the Vite URL (normally `http://localhost:5173`). The API listens on port 4000. Liveness is `GET /health`; database readiness is `GET /health/ready`.
4. Run `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build` before submitting changes. Database integration tests run only when `MONGODB_TEST_URI` and an isolated `MONGODB_TEST_DB_NAME` beginning `aslibooks_test_` are configured. See [integration testing](docs/integration-testing.md).

For end-to-end browser verification, follow [deployment and local operations](docs/DEPLOYMENT.md) and the CI workflow setup. Never point tests at production data.

## Project documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Accounting rules](docs/ACCOUNTING_RULES.md)
- [Security and recovery](docs/SECURITY.md)
- [Local development](docs/development.md)
- [Deployment and operations](docs/DEPLOYMENT.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)
- [Test evidence](docs/TEST_EVIDENCE.md)
- [Next actions](docs/NEXT_ACTIONS.md)
