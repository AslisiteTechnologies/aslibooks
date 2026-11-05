# Next actions

## Current checkpoint

Published head `f39e76e0408fcf8aa66bdbdd285ef92cff34789f` passed CI #328/#327, MongoDB #265/#264, and browser E2E #48/#47. Product and contact create/edit/archive and the end-to-end financial flow are covered. The current local change adds India-local posting-date cutoffs to aging reports and excludes future-posted documents, with regression data; verify by exact-SHA MongoDB workflow and publish it. Local integration was skipped because no replica-set URI is configured.

Preserve the original workspace edits; never stage the owner-supplied vision file. Never merge PR #1 to `main` or deploy production.

## Current implementation task

Verify and publish the aging report cutoff and test to `develop/phase-1-foundation`. Confirm exact-SHA CI, MongoDB, and browser workflows; investigate failures. Then continue the highest-priority unmet acceptance criteria in the master vision, inspecting current routes, models, UI and tests first. Remaining gaps include richer customer/vendor ledgers, qualified GST policy and scenarios, acceptance/security coverage, release operations and live provider configuration.

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

