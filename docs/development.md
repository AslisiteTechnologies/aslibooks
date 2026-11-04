# Local development

Prerequisites: Node.js 22, pnpm 10, MongoDB Atlas replica set (for future transactional posting).

1. Run `corepack enable`.
2. Run `pnpm install` at repository root.
3. Run `pnpm typecheck && pnpm test && pnpm build`.
4. For API development, copy `.env.example` to `apps/api/.env` and configure only your local values.
5. Run `pnpm --filter @aslibooks/api dev`. GET `http://localhost:4000/health` should respond with JSON.

Keep credentials out of Git and issues. The API serves health, Better Auth and
session-protected organization endpoints. See [deployment](DEPLOYMENT.md) for
local setup and the [progress tracker](PROGRESS.md) for current scope.

Financial posting must not be enabled until transactional persistence, immutability enforcement, reversal handling, authorization and concurrency tests are implemented.
