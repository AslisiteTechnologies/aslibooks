# Next actions

## Current checkpoint

Recovery head `37e20d201df008db80774da73c3fd69056dc2666` contains all nine verified nonempty pagination files and CI #335 passed. Historical malformed head `64135f913bf234679408077212ba6f2c8b317e57` is retained as an incident record; CI/Mongo failed and E2E #53/#54 are invalid because the test file was empty. Commit `451031e3d496008cc00964dd1850794419b8342d` fixed the Coastal archive test fixture and passed CI #341/#342, MongoDB #278/#279 and E2E #61/#62.

Preserve the original workspace edits; never stage the owner-supplied vision file. Never merge PR #1 to `main` or deploy production.

## Current implementation task

Remote statement pagination head `8a3a6e94ab6f42c31e737d768620c23ad5ffe804` passed CI #408 and Browser #128; MongoDB #345 failed. Local diagnosis fixed invalid projection constants and a first-page opening-balance facet that returned all rows. The focused statement replica-set suite passed 2/2; full API replica-set passed 105/105; workspace typecheck, lint, production build and the 390px Playwright flow passed, including full statement CSV download. Publish this correction on top of the latest remote head, inspect exact-SHA CI/MongoDB/E2E, then start transaction-to-subledger reconciliation.

## Exact verification commands

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
pnpm --filter @aslibooks/api test --maxWorkers=1 src/routes/contacts.integration.test.ts
$env:PYTHONPATH="$env:TEMP\aslibooks-playwright-runtime"
$env:PLAYWRIGHT_BROWSERS_PATH="$env:TEMP\codex-aslibooks-browsers"
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" apps/web/e2e/chart.py
```

For local integration/browser tests, use a disposable MongoDB replica set and API/web servers as described by `.github/workflows/e2e.yml` and `docs/integration-testing.md`. In this session, MongoDB ran locally on port 37491 with database names prefixed `aslibooks_test_`; API and Vite ran on ports 4000 and 5176. Do not point tests at production. If local services are unavailable, rely only on exact-commit GitHub workflow evidence and state which local tests were skipped.

## Remaining MVP work

- Transaction-to-subledger reconciliation for customer/vendor statement totals and their receivable/payable control accounts.
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

