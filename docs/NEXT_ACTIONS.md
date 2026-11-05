# Next actions

## Current checkpoint

Recovery head `37e20d201df008db80774da73c3fd69056dc2666` contains all nine verified nonempty pagination files and CI #335 passed. Historical malformed head `64135f913bf234679408077212ba6f2c8b317e57` is retained as an incident record; CI/Mongo failed and E2E #53/#54 are invalid because the test file was empty. Commit `451031e3d496008cc00964dd1850794419b8342d` fixed the Coastal archive test fixture and passed CI #341/#342, MongoDB #278/#279 and E2E #61/#62.

Preserve the original workspace edits; never stage the owner-supplied vision file. Never merge PR #1 to `main` or deploy production.

## Current implementation task

Trusted-Origin commit `e1c8e71cd5a4994cdde244311715a3d9be24bc79` passed CI #427/#428, MongoDB #364/#365 and Browser #147/#148. The next local GST gap is partially closed: generic tax arithmetic now supports an explicit fixed paise discount before tax; invoice-level discounts and tax-bearing posting remain blocked pending qualified review. Focused GST tests pass 4/4; full disposable replica-set workspace tests pass 136/136 (130 API, five accounting, one web), and typecheck, lint, build, audit and browser journey pass. Publish the GST arithmetic with evidence and verify all six exact-SHA workflows; next inspect cross-route authorization and acceptance 10 error/replay coverage.

## Exact verification commands

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
$env:MONGODB_TEST_URI="mongodb://127.0.0.1:27017/?replicaSet=rs0"
$env:MONGODB_TEST_DB_NAME="aslibooks_test_codex"
pnpm test
$env:PYTHONPATH="$env:TEMP\aslibooks-playwright-runtime"
$env:PLAYWRIGHT_BROWSERS_PATH="$env:TEMP\codex-aslibooks-browsers"
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" apps/web/e2e/chart.py
```

For local integration/browser tests, use a disposable MongoDB replica set and API/web servers as described by `.github/workflows/e2e.yml` and `docs/integration-testing.md`. In this session, MongoDB ran locally on port 37491 with database names prefixed `aslibooks_test_`; API and Vite ran on ports 4000 and 5176. Do not point tests at production. If local services are unavailable, rely only on exact-commit GitHub workflow evidence and state which local tests were skipped.

## Remaining MVP work

- Reconcile every master vision acceptance criterion to implemented code and direct test evidence, especially cross-tenant object access and viewer/accountant permissions (matrix is in `docs/MVP_ACCEPTANCE_MATRIX.md`).
- Review invoice lifecycle, sales/purchase tax handling and credit/refund boundaries; keep unsupported GST cases blocked pending qualified review.
- Verify financial reports, aging, customer/vendor ledgers and source journal reconciliation against realistic transaction fixtures.
- Review AI isolation and explicit human approval; AI must not post.
- Complete threat review, least-privilege runtime DB role, backup/restore, monitoring, staging runbook and release checklist.
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
