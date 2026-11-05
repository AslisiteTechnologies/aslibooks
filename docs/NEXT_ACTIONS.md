# Next actions

## Current checkpoint

Published head `64135f913bf234679408077212ba6f2c8b317e57` has empty blobs for the nine intended pagination files due to a concurrent remote-publish read race. CI #333/#334 and MongoDB #270/#271 failed; E2E #53/#54 were false-green because the script itself was empty. Prior head `1f88eea89ff18fbc47076248672dfa88fb5b885f` is the last correctly published commit. Local source and tests are preserved; republish all nine complete files with sequential verified reads, then rerun exact-SHA workflows.

Preserve the original workspace edits; never stage the owner-supplied vision file. Never merge PR #1 to `main` or deploy production.

## Current implementation task

Repair the empty remote blobs by creating fresh nonempty GitHub blobs from local source, then verify exact-SHA CI/MongoDB/browser runs and fix any test failures. Do not count the prior browser status as evidence. Once green, continue with customer/vendor ledgers and remaining acceptance criteria.

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

