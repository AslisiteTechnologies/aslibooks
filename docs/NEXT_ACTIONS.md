# Next actions

## Current checkpoint

Recovery head `37e20d201df008db80774da73c3fd69056dc2666` contains all nine verified nonempty pagination files and CI #335 passed. Historical malformed head `64135f913bf234679408077212ba6f2c8b317e57` is retained as an incident record; CI/Mongo failed and E2E #53/#54 are invalid because the test file was empty. Commit `451031e3d496008cc00964dd1850794419b8342d` fixed the Coastal archive test fixture and passed CI #341/#342, MongoDB #278/#279 and E2E #61/#62.

Preserve the original workspace edits; never stage the owner-supplied vision file. Never merge PR #1 to `main` or deploy production.

## Current implementation task

Customer and vendor advance allocation tests at `a4487e36ec6a7185a9d331320d4ba3729614a4e9` passed CI #435/#436, MongoDB #372/#373 and Browser #155/#156. Invoice and vendor bill draft POST require idempotency keys; same-body concurrent retries return one document, changed-body reuse returns 409, and browser coverage drops each first committed response then verifies the UI retry reuses its key. Bill draft uses a unique organization/key index, normalized request hash, and duplicate-race recovery. CI, MongoDB and Browser push/PR runs for `809cdc6ae511fe98aa7cce445d937c785c565393` all passed. Receipt and vendor payment same-key concurrent replay tests pass; `64d136243db1890e11cd5591f895eed4e4acb03d` passed push/PR CI #441/#442, MongoDB #378/#379 and Browser #161/#162. Invoice issue and customer/vendor credit tests race same-key requests; focused tests pass 6/6, full API suite passes 130/130 serially, and browser E2E verifies committed-response recovery. Commit `e4bd8b1d83ae8afa5f42bafa8975d30b0963b9a0` passed push/PR CI #443/#444, MongoDB #380/#381 and Browser #163/#164. Customer advance receipt, allocation and refund, and vendor advance receipt/allocation now also race identical same-key requests; focused suites pass 2/2, full API suite passes 130/130, and typecheck/lint/diff checks pass. Publish the advance retry coverage and verify exact-SHA workflows; then continue remaining MVP acceptance criteria.

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

## Active task: finish retry-key follow-up, then close tenant/role test gaps
1. Publish the verified customer/vendor credit and payment retry-key UI corrections on top of the latest remote `develop/phase-1-foundation` commit without including unrelated work from the stale/dirty source checkout.
2. Verify all six exact-SHA push/PR workflows (CI, MongoDB integration and Browser).
3. Inventory mounted API routes and compare each organization-scoped read, write, attachment, statement and export endpoint with `apps/api/src/security/authorization.ts` plus the acceptance matrix. Add tests for uncovered foreign-tenant and viewer-write cases.

Local evidence: full replica-set workspace suite (130 API, five accounting, one web), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm audit --audit-level=high`, and `apps/web/e2e/chart.py` passed on the source checkout. Exact-SHA workflows for the new commit are pending.

Security audit progress: focused foreign-tenant advance tests pass locally. The next specific task is to continue route-by-route review of read/write endpoints and object references, recording uncovered cases in `docs/MVP_ACCEPTANCE_MATRIX.md`; exact-SHA workflows for the new regression coverage remain pending.

Current security-test checkpoint: foreign-tenant customer/vendor advance ID cases pass focused tests (2/2), and the complete workspace suite passes 136/136. Last exact-SHA UI commit `8c6d55cf013a56d2dc2e6540b3000ad56f5e85ad` passed CI #448, MongoDB #385 and Browser #168. Publish the current tenant-isolation regression test commit and verify its Actions runs. Then continue auditing mounted routes and foreign references not yet directly covered; do not mark acceptance criterion 1 complete from these two route families alone.
