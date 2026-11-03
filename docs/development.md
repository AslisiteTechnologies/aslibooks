# Local development

Prerequisites: Node.js 22, pnpm 10, MongoDB Atlas replica set (for future transactional posting).

1. Run `corepack enable`.
2. Run `pnpm install` at repository root.
3. Run `pnpm typecheck && pnpm test && pnpm build`.
4. For API development, copy `.env.example` to `apps/api/.env` and configure only your local values.
5. Run `pnpm --filter @aslibooks/api dev`. GET `http://localhost:4000/health` should respond with JSON.

Security: do not commit credentials or paste them in issues. The API currently has only a health endpoint. Authentication, tenant-bound business endpoints, transaction posting and web/mobile screens are not yet available.

Financial posting must not be enabled until transactional persistence, immutability enforcement, reversal handling, authorization and concurrency tests are implemented.
