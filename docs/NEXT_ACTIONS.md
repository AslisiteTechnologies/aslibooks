# Next actions

## Current checkpoint

Published head `7b8e8b2cb12cf6004e36b39f36680e83a7c03565` passed CI #326/#325, MongoDB #263/#262, and browser E2E #46/#45. Product/service creation, edit, and confirmed archive are covered by the browser flow. This local change adds confirmation-gated contact archiving and browser assertions after customer/vendor transactions; run checks, publish it, and verify exact-SHA Actions. Local tests skip DB-backed cases and browser execution needs MongoDB/API/web services; Docker and mongod are unavailable on this host.

Preserve the original workspace edits; never stage the owner-supplied vision file. Never merge PR #1 to `main` or deploy production.

## Current implementation task

Publish the contact archive UI and E2E coverage to `develop/phase-1-foundation`. Confirm exact-SHA CI, MongoDB, and browser runs; investigate and fix any failures. Then continue with the highest-priority unmet acceptance criteria in `ASLIBOOKS_CODEX_VISION_AND_EXECUTION.md`, inspecting current route, model, UI, and tests before each change. The MVP is not complete: tax scenarios, customer/vendor subledgers, acceptance/security coverage, release operations, and live provider configuration still need review and implementation where unblocked.

## Exact verification commands

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
pnpm --filter @aslibooks/api test --maxWorkers=1 src/routes/products.integration.test.ts
$env:PYTHONPATH="$env:TEMP\aslibooks-playwright-runtime"
$env:PLAYWRIGHT_BROWSERS_PATH="$env:TEMP\codex-aslibooks-browsers"
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" apps/web/e2e/chart.py
```

For local integration/browser tests, provision a disposable MongoDB replica set and API/web servers as described by `.github/workflows/e2e.yml` and `docs/integration-testing.md`. Do not point tests at production. If unavailable, rely only on exact-commit GitHub workflow evidence and state which local tests were skipped.

## Remaining MVP work

- Reconcile every master vision acceptance criterion to implemented code and direct test evidence, especially cross-tenant object access and viewer/accountant permissions.
- Review invoice lifecycle, sales/purchase tax handling and credit/refund boundaries; keep unsupported GST cases blocked pending qualified review.
- Verify financial reports, aging, customer/vendor ledgers and source journal reconciliation against realistic transaction fixtures.
- Review AI isolation and explicit human approval; AI must not post.
- Complete threat review, dependency/security audit, least-privilege runtime DB role, backup/restore, monitoring, staging runbook and release checklist.
- Production email credentials/sender verification and live delivery require owner configuration; do not claim verified delivery without it.

## Restart commands

```powershell
cd D:\aslibooks-next
git status --short --branch
git log -5 --oneline
git ls-remote origin refs/heads/develop/phase-1-foundation
Get-Content docs/IMPLEMENTATION_STATUS.md
Get-Content docs/TEST_EVIDENCE.md -Tail 80
Get-Content docs/NEXT_ACTIONS.md
```

