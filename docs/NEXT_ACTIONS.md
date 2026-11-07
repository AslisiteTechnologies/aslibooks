# Next actions

## Background auth email failure visibility — verified at `7afb605` (2026-11-07)

Provider send failures are now observable through the sanitized logger while auth responses remain asynchronous, generic and enumeration-safe. Focused tests pass 2/2 and all six exact-SHA CI/MongoDB/Browser workflows pass (#675/#676, #610/#611, #394/#395). Live email delivery and provider-side logging require staging credentials.

## API/operator error-log redaction — verified at `0b47ec5` (2026-11-07)

Runtime and operator-command exception objects are no longer logged. Safe fixed event/type metadata is tested against synthetic secrets, financial values and connection strings. Focused test/typecheck/lint/build and all six exact-SHA CI/MongoDB/Browser workflows pass (#671/#672, #606/#607, #390/#391). Continue reviewing external hosting/provider logs during a staging rehearsal.

## Node.js runtime alignment — verified at `e45532d` (2026-11-07)

All six exact-SHA workflows passed: CI #665/#666, MongoDB #600/#601, Browser #384/#385. Node 24 LTS is now used by workflows and documented for development/staging. Continue with independent product gaps that do not require external provider access; keep staging, policy and approval gates explicit.

## Current completion checkpoint — 2026-11-07

Records export is implemented and verified at exact pushed SHA `03b2d689be788957ec602fd6144a22ad6536de5f`; all six push/PR Actions passed: CI #657/#658, MongoDB #592/#593, Browser #376/#377. The first hosted MongoDB attempt failed only in immutable fixture cleanup and was corrected on the next commit; the final run passed. Locally, 80 tests pass and 85 MongoDB-dependent tests skip without a local replica set; typecheck/lint/build/high-severity audit pass. The export excludes attachment bytes and is not a full archive; deletion and lifecycle policy remain pending.

Next: continue closing independent local product gaps from the master vision. Latest source SHA `7afb60519af6dfba2b56bef3844658203a8dba5f` passed all six exact-SHA workflows (CI #675/#676, MongoDB #610/#611, Browser #394/#395). Keep synthetic test data. Staging access, restore/monitoring/rollback rehearsal, owner/adviser policy decisions, qualified accounting/tax review, full attachment archive/deletion behavior, manual accessibility and release approval remain open gates. Do not stage the owner-supplied vision file, merge `main` or deploy production. Overall status remains development/MVP candidate, not production-ready.

## Verified runtime refresh — 2026-11-07

Completed at `c4c0a54a0165ae1f7352128fabc6a9b77ab0a438`. All six exact-SHA checks passed: CI #659/#660, MongoDB #594/#595, Browser #378/#379. The remaining Ubuntu runner image notice is controlled by GitHub; review it during future dependency/runner maintenance.

## Current completion checkpoint — 2026-11-07

Source code change `2ba0d100a525fb631bfccbb052bcb18bae4803a` is committed and pushed; all six exact-SHA checks passed (CI #42337192383/#42337202719, MongoDB #42337192391/#42337202791, Browser #42337192362/#42337202748). Local validation: 80 tests pass (API unit 65, accounting 5, web 10); 84 API integration tests skip without local MongoDB. Workspace typecheck/lint/build and high-severity audit pass. Auth-screen keyboard/focus and offline-retry review is limited to unauthenticated UI. Remaining work: full authenticated manual accessibility, data-lifecycle policy approval and implementation, staging credentials/operations, backup/restore/monitoring/rollback rehearsal, qualified tax/accounting review and release approval. Do not stage `ASLIBOOKS_CODEX_VISION_AND_EXECUTION.md`, touch dirty peer worktrees, merge `main` or deploy production.

## Active checkpoint — publish verified migration-target guard (2026-11-06)

Branch `codex/aslibooks-mvp` and `origin/develop/phase-1-foundation` are aligned at `719cf9358f034e640775bb962666618dc7d30b61`; all six exact-SHA checks passed (CI #42226301324/#42226309451, MongoDB #42226301093/#42226309470, Browser #42226301091/#42226309471). Next, complete non-production release gates only when staging/provider access is supplied: restricted grants validation, synthetic restore rehearsal, monitoring/alert exercise, and rollback rehearsal; perform the outstanding manual keyboard/focus/screen-reader review on a live build. Do not deploy production, merge main, or claim GST compliance. Staging readiness stays unverified. Exact local commands: `git status --short --branch`; `git rev-parse HEAD`; `git ls-remote origin refs/heads/develop/phase-1-foundation`; `pnpm typecheck`; `pnpm lint`; `pnpm test`; `pnpm build`; `pnpm audit --audit-level=high`.

## Active checkpoint — product audit, bank import correction, multi-invoice receipt UI (2026-11-06)

Repository/worktree/remote audit is recorded in [PRODUCT_AUDIT_2026-11-06.md](PRODUCT_AUDIT_2026-11-06.md). Base SHA `4e3dd782f42b173eba2b1a3c4ba1e94d1006e808` was the remote development head; its six Actions workflows passed. A synthetic real-UI business scenario reconciled invoice → two receipts → vendor bill/payment → bank transfer → two-row bank import/match/reconciliation to GL, trial balance, P&L, balance sheet, aging and control totals. The scenario exposed and locally fixed a multi-row import transaction error; focused replica-set regression passes 2/2. Receipt UI multi-invoice allocations and payment UI multi-bill allocations are implemented. At `fe25855`, CI and MongoDB push/PR workflows passed, while Browser push/PR failed because the new test reused a customer archived earlier in the same scenario. The E2E now creates fresh synthetic customer/vendor contacts before testing multi-invoice receipts. Full API replica-set suite passes 142/142; accounting 5/5 and web 8/8; typecheck, lint, build, audit, diff checks and disposable index preparation pass. Publish the fixture correction and multi-bill workflow on the existing development branch; verify all six exact-SHA workflows before continuing. Do not include the untracked owner vision file or alter other worktrees.

Follow-up `3db9b8a1119ae7be3f3ad31380bc847c3981e545`: CI push/PR and MongoDB push/PR passed. Browser push failed because the bill test used an unscoped `Vendor` label that matched three fields; it is corrected to select the bill form’s first Vendor field. Browser PR run is still in progress. Publish the selector correction and verify the exact-SHA Browser workflows before proceeding to cursor pagination for invoice/bill/receipt/payment lists.

## Active checkpoint — viewer access to customer receipt records (2026-11-06)

Added a positive viewer GET assertion after a customer receipt is recorded, including the receipt identity, organization ID and amount. Local typecheck, lint, production build and diff check pass; the focused receipt integration file skips because no local replica set is available. Commit/push and verify all six exact-SHA workflows, then continue endpoint × role × reference coverage.

## Active checkpoint — viewer dashboard and general-ledger access (2026-11-06)

Extended the source-reconciled financial workflow fixture with viewer checks for date-filtered dashboard KPIs and the income-account general-ledger running balance. At `106da57`, all six exact-SHA workflows passed: CI #593/#594, MongoDB #528/#529, Browser #312/#313. Local workspace verification passed (63 tests, 77 MongoDB-dependent skips, typecheck, lint, production build, and diff check); the focused integration file skips without a local replica set. Tenant-isolation change `c8ff4fa` passed all six workflows: CI #591/#592, MongoDB #526/#527, Browser #310/#311. Next: continue the route/role/reference matrix and document remaining release gates.

## Active checkpoint — secure ownership transfer (2026-11-06)

The owner-transfer gap from the route/feature review now has an API/UI implementation: current owner explicitly confirms a transfer to an active admin; one MongoDB transaction demotes the current owner to admin, promotes the target to owner, and records both membership audit events. Added integration coverage for non-owner denial, invalid confirmation, non-admin target denial, final roles, sole active-owner count and audit count. At `f6fa853`, CI #603/#604 and MongoDB #538/#539 passed; Browser PR #323 passed and Browser push #322 remains running. Local typecheck, lint, production build and diff check pass. The focused membership integration test skips locally without MongoDB. Next: verify Browser push, close any findings, then continue endpoint × role × guessed-reference and release-readiness audits.

## Active checkpoint — viewer reads for documents and source attachments (2026-11-06)

Extended route-role evidence so a viewer can list and inspect an invoice, list vendor bills, and download authorized source attachment bytes with `private, no-store` headers. These positive read-permission assertions complement viewer write denials and tenant-boundary tests. All six exact-SHA workflows passed at `72ff824`: CI #605/#606, MongoDB #540/#541, Browser #324/#325. Local typecheck, lint, production build and diff check pass; all eight focused integration tests skip because MongoDB is unavailable locally, and hosted MongoDB verified them. Continue with remaining route × role and release gates.

## Active checkpoint — committed receipt/vendor payment response-loss retries (2026-11-06)

Corrected the browser receipt retry simulation: the first POST reaches and commits on the API before Playwright aborts its response, and the retry must return `replayed: true` under the same idempotency key. Previously the route aborted before reaching the server, so it only tested pre-commit network failure. Added the same committed-response-loss assertion for partial vendor payments. At `eb77fb8` and `c776f8d`, CI/MongoDB passed but Browser failed because the test expected 201 on a replay; the API correctly returns 200 for replayed writes. The assertions were corrected to 200 at `85c6cb8`; all six workflows passed (#601/#602, #536/#537, #320/#321). Continue with the route/role audit and preserve exact workflow evidence.

## Active checkpoint — viewer source-report access (2026-11-06)

The viewer source-report regression passed hosted MongoDB #522/#523 and CI #587/#588 at `ca394f6`; Browser PR #307 passed and Browser push #306 was still running at last check. It verifies customer-ledger, trial-balance, P&L, balance-sheet, AR/AP aging, and control-reconciliation access at source-derived exact totals. Local focused run skips without MongoDB; API typecheck/lint pass. Owner-demotion/admin-invitation race also passed all six workflows at `f79b61b`.

## Active checkpoint — frontend production chunking (2026-11-06)

`apps/web/vite.config.ts` now splits React, MUI, Emotion and icon vendors into separate chunks. Local `pnpm build` passes with no chunk warning: entry 24.54 kB (7.37 kB gzip), React 223.66 kB (69.42 kB gzip), MUI 247.88 kB (71.72 kB gzip), Emotion 26.81 kB (11.18 kB gzip); web tests 8/8, lint and diff check pass. Commit/push and verify all six exact-SHA workflows, then continue remaining route × role × reference cases and manual accessibility review.

## Active checkpoint — browser export and attachment tenant isolation (2026-11-06)

The browser E2E now switches to a freshly created second organization and asserts there are no customer/vendor statement export actions or invoice attachment actions there, in addition to no first-tenant journal activity. Python syntax, web tests 8/8, lint, typecheck, production build and diff check pass locally. The full browser test requires hosted MongoDB and Browser workflows; publish and verify exact-SHA results before claiming this isolation path.

## Active checkpoint — organization-management race guard (2026-11-06)

Organization-management concurrency regression passed all six exact-SHA workflows at `f79b61b`: CI #583/#584, MongoDB #518/#519, Browser #302/#303. The owner-demotion/admin-invitation race commits only a pre-demotion invitation or rejects after demotion; subsequent attempts are denied and audit counts match. Local API typecheck/lint pass; focused test skips locally without a replica set, and hosted MongoDB verified it. Next: continue the remaining endpoint × role × reference audit and manual accessibility review. Automated accessibility and the complete browser flow passed at `01e3232` (#579/#580, #514/#515, #298/#299).

## Active checkpoint — warning contrast and expanded a11y coverage (2026-11-06)

Accessibility automation is green at exact SHA `01e3232`: CI #579/#580, MongoDB #514/#515, Browser #298/#299. This full desktop/mobile run includes axe WCAG 2.1 A/AA scans across sign-in, onboarding, overview, team, settings, accounting, contacts, products, sales, receipts, expenses/AI, banking, GST, fiscal close and reports. The two discovered contrast issues and missing progressbar name are fixed. Local web tests pass 8/8, lint/typecheck/build/diff checks pass; production build warns of a 500.92 kB main chunk (153.97 kB gzip). Continue the cross-route tenant/reference/role audit and record a manual keyboard/focus/screen-reader review; do not mark accessibility complete based only on automated scans.

## Active checkpoint — axe contrast correction (2026-11-06)

`385af28491dd943747c4bfe0277b511461d36440` passed CI #573/#574 and MongoDB #508/#509. Browser #292/#293 failed at the Sales screen: axe measured 2.59:1 on a disabled contained action, white on MUI's faded lavender background. `apps/web/src/main.tsx` now preserves the semantic disabled attribute while keeping contained-button text at 4.5:1 or higher. Web tests (8/8), lint, typecheck, build and `git diff --check` pass locally; production build still reports a 500.82 kB main chunk (153.94 kB gzip). Commit/push this correction and inspect all six exact-SHA workflows. Browser should continue the flow and reveal any later accessibility findings. Do not mark accessibility complete until the full scan passes and manual review is done.

## Active checkpoint — automated accessibility verification (2026-11-06)

This checkout is on `codex/aslibooks-mvp`; the stale local development branch and its 25 patch-equivalent commits remain preserved, and the original uncommitted workspace snapshot remains in `git stash@{0}`. The owner-supplied vision file is kept untracked and must not be staged.

CI hardening SHA `ddfb53707e3ea7a8a71c884356e94fa5489dedc5` passed exact-SHA CI #567/#568, MongoDB #502/#503 and Browser #286/#287; lint and high-severity audit are now CI gates. Persisted organization selection passed all six workflows at `725fe17d2f87fb5157d2ee9cc0038f8e97d361cd` (#569/#570, #504/#505, #288/#289). Axe-core WCAG 2.1 A/AA scans were added at `65c22f8`; Browser PR #291 found the navigation `<ul>` contained buttons without `<li>` wrappers. The local fix adds MUI `ListItem` wrappers and passes typecheck/lint/web tests/build; the build warns that the uncompressed main bundle is 500.70 kB (153.89 kB gzip). Publish the semantic fix and verify the full hosted Browser scan across sign-in, onboarding and primary pages; correct further findings before treating automated coverage as passing. Then continue route/role evidence and manual accessibility review. Keep manual review explicitly open.

Do not merge PR #1 or deploy production. Do not close the MVP checklist while tax/accounting review, staging grants and validation, backup/restore, monitoring, malware/retention controls, and final owner release acceptance remain unverified.

## Active checkpoint — manual journal and vendor credit reference isolation

At `b3111f7`, CI #563/#564 and MongoDB #498/#499 passed; Browser #282/#283 remains in progress for the manual-journal foreign-account checks, foreign-bill/vendor and journal-detail denial, and mobile overflow assertions. The current local E2E change activates invoice draft save and issue confirmation with Enter. Commit/push it, verify exact-SHA Browser, and fix any failure. Then continue the remaining route/role, accessibility and release-readiness work. Local replica set, Docker, and Python/Playwright are unavailable. Acceptance criteria remain Partial.

## Active checkpoint — route-driven report reconciliation

The remote development branch is at `c0b9e6a4ca75fb10411309783b38b562d66e296e`; exact-SHA CI #525/#526, MongoDB #460/#461 and Browser #244/#245 all passed. The active local change rewrites the report reconciliation fixture so opening balances also enter through the authorized opening-balance API. Typecheck, lint, production build, dependency audit and `git diff --check` pass locally. MongoDB at `127.0.0.1:37491` is unavailable, so publish the fixture on the development branch and wait for exact-SHA hosted MongoDB verification. Then continue the mounted-route role/reference audit and responsive accessibility work. Keep acceptance criteria partial while any route permutations and external release gates are open.

Publication `78c0c354e5f19a55410b6020ed8af64ed2ec7a3b` exposed a fixture teardown error: the immutable opening-balance schema rejects model-level `deleteMany`. The report assertions passed, but the MongoDB job failed on teardown. Teardown now uses `OpeningBalanceModel.collection.deleteMany` in this isolated test fixture. Typecheck/lint/build/audit/diff checks pass for this correction; publish and wait for the exact-SHA rerun before proceeding with report completion claims.

Exact local checks already run for this slice:

```powershell
pnpm typecheck
pnpm lint
pnpm build
pnpm audit --audit-level=high
git diff --check
```

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
cd D:\aslibooks
git status --short --branch
git log -5 --oneline
git ls-remote origin refs/heads/develop/phase-1-foundation
Get-Content docs/IMPLEMENTATION_STATUS.md
Get-Content docs/TEST_EVIDENCE.md -Tail 80
Get-Content docs/NEXT_ACTIONS.md
pnpm --filter @aslibooks/web test
pnpm lint
pnpm typecheck
pnpm build
pnpm audit --audit-level=high
git diff --check
```

## Active task: finish retry-key follow-up, then close tenant/role test gaps
1. Publish the verified customer/vendor credit and payment retry-key UI corrections on top of the latest remote `develop/phase-1-foundation` commit without including unrelated work from the stale/dirty source checkout.
2. Verify all six exact-SHA push/PR workflows (CI, MongoDB integration and Browser).
3. Inventory mounted API routes and compare each organization-scoped read, write, attachment, statement and export endpoint with `apps/api/src/security/authorization.ts` plus the acceptance matrix. Add tests for uncovered foreign-tenant and viewer-write cases.

Local evidence: full replica-set workspace suite (130 API, five accounting, one web), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm audit --audit-level=high`, and `apps/web/e2e/chart.py` passed on the source checkout. Exact-SHA workflows for the new commit are pending.

Security audit progress: focused foreign-tenant advance tests pass locally. The next specific task is to continue route-by-route review of read/write endpoints and object references, recording uncovered cases in `docs/MVP_ACCEPTANCE_MATRIX.md`; exact-SHA workflows for the new regression coverage remain pending.

Current security-test checkpoint: foreign-tenant customer/vendor advance ID cases pass focused tests (2/2), and the complete workspace suite passes 136/136. Last exact-SHA UI commit `8c6d55cf013a56d2dc2e6540b3000ad56f5e85ad` passed CI #448, MongoDB #385 and Browser #168. Publish the current tenant-isolation regression test commit and verify its Actions runs. Then continue auditing mounted routes and foreign references not yet directly covered; do not mark acceptance criterion 1 complete from these two route families alone.

Active route-audit slice: fiscal period, settings, bill and vendor-payment foreign-tenant regression tests are implemented and focused tests pass. Run the complete workspace suite, then build/lint/check, publish on top of the current branch head and verify exact-SHA Actions. Continue with any remaining route/reference gaps after that commit.

Additional route-audit checkpoint: foreign fiscal-period close/checklist, settings read/write, peer bill mutation, vendor-payment foreign bill allocation, and cash-transfer foreign account references are now covered. Full workspace suite 136/136 and typecheck/lint/build/audit/diff checks pass; exact-SHA Actions for this extension are pending publication. Next audit route families with remaining open foreign-reference/export evidence, then record concrete residual gaps.

Current report-reconciliation checkpoint: source-driven customer/vendor statements now tie to the same 6,000/5,000 paise outstanding amounts as trial balance, aging and control-account reports. The initial source-report commit `df319d53347925def5760056a7b094ce9117a7bc` passed exact-SHA CI #454, MongoDB integration #391 and Browser #174. Statement assertions pass focused and full workspace tests (137/137); typecheck, lint, build, high-severity audit and diff check also pass locally. Publish the follow-up and record its exact-SHA checks. Then continue the route-by-route tenant/read/write authorization audit; begin with attachments, statements and foreign object references, add any missing real-record negative tests, and update the acceptance matrix with file-level evidence.

Active route-audit checkpoint: real foreign source journal upload, contact detail/statement access, report organization path and report account reference tests are implemented. Focused suites pass 6/6; full workspace suite passes 137/137 and typecheck/lint/build/high-severity audit/diff checks pass. Parent commit `ea6c7d34a96af5a0b65b17e4a789101b78b01279` passed exact-SHA CI #456, MongoDB #393 and Browser #176. Publish this test extension and verify all three exact-SHA runs; continue the audit through remaining financial route families, especially cross-tenant document references and role writes.

Invoice reference audit extension: a real peer-tenant product ID is rejected when used in an invoice draft under another tenant, without creating an invoice. Focused invoice suite passes 2/2; full suite is 137/137 and typecheck/lint/build/high-severity audit/diff all pass. Parent `9bdeca404707c9115d367b674a8d12ada0bbec8d` passed CI #458, MongoDB #395 and Browser #178. Publish the grouped route-audit changes, then continue reviewing payment, credit and membership endpoints.

Membership audit extension: tests deny peer-organization member list access and guessed foreign membership ID updates from an owner of another organization, then verify the foreign membership remains active. Grouped invoice/member suites pass 3/3; full suite 137/137 and typecheck/lint/build/audit/diff pass. Parent `e2d893b226dacb07627a06dfe2e77b408839731b` passed CI #460 and MongoDB #397; Browser #180 is still in progress. Publish the grouped changes and verify exact-SHA workflows; next inspect remaining invitation and bank-statement object references.

Bank statement audit extension: tests use real foreign account and journal records to prove import/matching remain organization-scoped. Focused suite passes 1/1; full suite passes 137/137 and typecheck/lint/build/high-severity audit/diff checks pass locally. Publish the bank/member group, verify exact-SHA workflows; then continue auditing remaining route families and close the route inventory.

Journal reversal audit extension: a real foreign source journal cannot be reversed through another organization's path. Focused suite passes 1/1; full workspace suite passes 137/137 and typecheck/lint/build/high-severity audit/diff checks pass. Parent `9867ef263e2cd28ad8e6b2499198cd26b8ab1cd7` passed CI #464 and MongoDB #401; Browser #184 remains in progress. Publish the bank/journal group and verify exact-SHA workflows; then inspect route inventory for uncovered foreign IDs or write permission gaps.

## Active task: publish GST setup review, then continue closing the MVP gap list
1. Publish only `apps/web/src/GSTReadinessScreen.tsx`, `apps/web/src/gstReadiness.ts`, `apps/web/src/gstReadiness.test.ts`, `docs/IMPLEMENTATION_STATUS.md`, `docs/MVP_ACCEPTANCE_MATRIX.md`, `docs/TEST_EVIDENCE.md`, and this file on top of the latest remote `develop/phase-1-foundation` head; preserve all other work.
2. Verify exact-SHA CI, MongoDB integration, and Browser workflows; investigate any failure.
3. Continue with source document and lifecycle workflows from `ASLIBOOKS_CODEX_VISION_AND_EXECUTION.md`: inspect product/service and invoice UX for remaining inaccessible or incomplete lifecycle states, add the next verified end-to-end gap, then run the full validation cycle.

Exact local validation commands (Windows PowerShell, from repository root):
```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:37491/?replicaSet=testset'
$env:MONGODB_TEST_DB_NAME='aslibooks_test_final_gst_readiness'
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm audit --audit-level=high
git diff --check
```

External gates still open: qualified GST/accounting policy review; staging/production credentials and approval; database least-privilege grants, backup/restore rehearsal, monitoring, email deliverability, attachment malware/retention policy; final accessibility/security review. Do not merge to `main` or deploy without explicit authorization.

## Active task: verify printable reports and continue the remaining MVP workflows
1. Publish the report print/PDF packet, escaping tests, browser assertion, and updated status documents only, on top of remote head `be764d95f827ea588c01073461effca3eab49f2d`.
2. Check exact-SHA CI, MongoDB integration and Browser workflows; Browser #188 at parent `be764d95f827ea588c01073461effca3eab49f2d` passed and the new SHA must exercise the added popup assertion.
3. Next audit role and lifecycle behavior for reports/export and invoice print content; add real browser assertions for role denial and print packet behavior where missing, then inspect remaining acceptance gaps.

Validation commands (PowerShell, repository root):
```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:37491/?replicaSet=testset'
$env:MONGODB_TEST_DB_NAME='aslibooks_test_printable_reports'
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm audit --audit-level=high
git diff --check
```

External release gates remain: qualified accounting/GST review; staging and production secrets/access plus explicit deployment authorization; database least-privilege grants and restore rehearsal; monitoring and email deliverability; attachment malware scanning/retention policy; final accessibility/security review. Keep PR #1 Draft; do not merge `main` or deploy production without owner authorization.

## Active task: publish receipt tenant-boundary regression, then continue the route and role matrix
1. Publish only `apps/api/src/routes/receipts.integration.test.ts` and updated status documents on top of remote `d02af80789419177ec59d265d84d7cc6f55d034d`.
2. Verify exact-SHA CI, MongoDB and Browser Actions.
3. Continue auditing the acceptance matrix's tenant isolation and role permissions for every mounted route, attachment/content path, and export. Add a real-data denial test where route coverage is missing, then run full validation.

PowerShell validation commands from repository root:
```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:37491/?replicaSet=testset'
$env:MONGODB_TEST_DB_NAME='aslibooks_test_foreign_receipt_account_full'
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm audit --audit-level=high
git diff --check
```

External gates: qualified accounting/GST review, staging/production access and explicit deploy authorization, database least privilege/backup restore/monitoring/email, attachment malware and retention review, final accessibility/security review. PR #1 remains Draft; do not merge main or deploy production without authorization.

## Active task: publish accounting object-reference tests, then continue role/export coverage
1. Publish only `apps/api/src/routes/bills.integration.test.ts`, `apps/api/src/routes/invoices.integration.test.ts`, and the updated status documents on top of remote `a8b4e4aa7a69dc5dcbbc9460bae3629c0860b220`.
2. Verify exact-SHA CI, MongoDB, and Browser workflows.
3. Continue auditing each mounted route’s role matrix and tenant-scoped exports/attachments; add real-record denial cases wherever direct evidence is absent. Then rerun the complete suite and security audit.

PowerShell commands from repository root:
```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:37491/?replicaSet=testset'
$env:MONGODB_TEST_DB_NAME='aslibooks_test_reference_audit_full'
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm audit --audit-level=high
git diff --check
```

Release gates still open: qualified accounting/GST review, authorized staging/production access and deployment approval, database grants/backup restore/monitoring/email operations, attachment malware/retention review, and final accessibility/security review. PR #1 remains Draft; keep `main` untouched and do not deploy production.

## Active task: publish bank viewer-write tests, then continue route permission audit
1. Publish only `apps/api/src/routes/bankStatements.integration.test.ts` and updated status documents on remote `fa5c289ce495a62eafed7c4dd1974fec1722f4eb`.
2. Verify exact-SHA CI, MongoDB, and Browser Actions.
3. Continue viewer/admin/accountant role matrix audit through fiscal periods, organization settings, exports, and attachments; add missing integration evidence and rerun full validation.

Run from PowerShell repository root:
```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:37491/?replicaSet=testset'
$env:MONGODB_TEST_DB_NAME='aslibooks_test_role_object_audit'
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm audit --audit-level=high
git diff --check
```

Unresolved external release gates: qualified accounting/GST review; staging/production access and deployment approval; database least privilege, backup/restore and monitoring; email deliverability; attachment malware/retention; final accessibility/security review. PR #1 stays Draft, `main` untouched, and no production deployment.

## Active task: publish accountant bank permissions and continue remaining role matrix gaps
1. Publish `apps/api/src/routes/bankStatements.integration.test.ts` and the updated progress documents on top of remote `ac0af67275ac0230d1f1b1d5d5dbe1fd647b0c0c`.
2. Verify exact-SHA CI, MongoDB, and Browser Actions.
3. Continue testing per-role access for attachments, organization/settings, fiscal-period closure, reports and exports; verify destructive/mutating actions leave state unchanged when denied.

PowerShell validation (repository root):
```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:37491/?replicaSet=testset'
$env:MONGODB_TEST_DB_NAME='aslibooks_test_role_matrix_full'
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm audit --audit-level=high
git diff --check
```

External gates remain: qualified accounting/GST review, staging/production access and deploy approval, least-privilege database grants, backup/restore/monitoring, email delivery, attachment malware/retention, final accessibility/security review. Draft PR remains unmerged; no production deployment.

## Active task: publish role coverage updates, then continue remaining authorization gaps
1. Publish `apps/api/src/routes/attachments.integration.test.ts`, `apps/api/src/routes/organizationSettings.integration.test.ts`, `apps/api/src/routes/fiscalPeriods.integration.test.ts`, and progress documents on top of remote `ca8ae17336f5a831d4d12ddaa69f5e20a6d4ad29`.
2. Verify exact-SHA CI, MongoDB and Browser Actions.
3. Continue auditing viewer/accountant/admin behavior for all mounted endpoints and exported data, then record the residual role matrix and run full validation.

PowerShell commands from workspace root:
```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:37491/?replicaSet=testset'
$env:MONGODB_TEST_DB_NAME='aslibooks_test_roles_extended_full'
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm audit --audit-level=high
git diff --check
```

Release blockers needing external owner/expert work: qualified accounting/GST policy review, staged/production credentials and deployment approval, DB grants/backup restoration/monitoring, email delivery provider, attachment malware and retention decisions, and final accessibility/security review. PR #1 stays Draft and production remains undeployed.

## Active task: publish accountant financial-posting coverage, then close the route-role matrix
1. Publish `apps/api/src/routes/invoices.integration.test.ts`, `apps/api/src/routes/bills.integration.test.ts`, `apps/api/src/routes/receipts.integration.test.ts`, and updated progress documents on top of remote `69b3450af81a3a7535916680b0fea34dd17d2797`.
2. Verify exact-SHA CI, MongoDB, and Browser workflows.
3. Continue route-by-route verification of the role matrix and exported data boundaries. Reconcile remaining matrix gaps against mounted routes before claiming acceptance.

PowerShell validation from repository root:
```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:37491/?replicaSet=testset'
$env:MONGODB_TEST_DB_NAME='aslibooks_test_accountant_full'
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm audit --audit-level=high
git diff --check
```

External release gates remain: qualified accounting/GST policy review; authorized staging/production access and deployment approval; DB least-privilege grants, restore/monitoring; email delivery; attachment malware/retention; final accessibility/security review. Keep PR #1 Draft, do not touch `main`, and do not deploy production.

## Active task: publish vendor payment role coverage and continue the permission audit
1. Publish `apps/api/src/routes/bills.integration.test.ts` and updated status docs on top of remote `986e1a3ca851b11eca30b7926a6a3da261216da0`.
2. Verify exact-SHA CI, MongoDB, and Browser workflows.
3. Continue role checks through customer/vendor advances and any remaining write routes; audit export object scoping, then keep the acceptance matrix accurate.

PowerShell verification commands from repository root:
```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:37491/?replicaSet=testset'
$env:MONGODB_TEST_DB_NAME='aslibooks_test_accountant_payment_full'
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm audit --audit-level=high
git diff --check
```

Release still requires qualified accounting/GST review and authorized staging/production operations, DB least privilege/backups/monitoring, configured email delivery, attachment malware/retention controls, and final accessibility/security review. The draft PR remains unmerged; no production deployment.

## Current task after advance role verification
Publish accountant/viewer coverage for customer advance receipt/allocation/refund and vendor advance receipt/allocation. Verify CI, MongoDB integration and Browser workflows on the resulting SHA. Then resume the mounted-route tenant/reference audit with endpoints and object references not yet covered by direct no-side-effect tests, and keep the acceptance matrix status partial until every criterion has direct evidence.

After the current role coverage commit, continue the endpoint matrix on manual journals and reversals: verify accountant posting/reversal is allowed, viewer posting/reversal is denied without side effects, then identify any remaining uncovered financial writes. Keep production gates and tax review explicit.

Next: publish manual journal/reversal role evidence and check all three hosted workflows. Then continue the matrix audit over every financial route, especially account/catalog/contact writes, fiscal-period close roles, and organization membership management; add real route cases for any permission gap. Keep all acceptance statuses partial until the entire surface and operation races are reconciled.

Next route audit slice: publish the verified accountant/viewer create/update coverage for accounts, contacts and products, then inspect organization settings, fiscal periods and membership routes for remaining untested role operations. Continue to distinguish the full route matrix from any narrow regression tests.

After publishing and checking the fiscal admin-close regression, finish the organization membership/period/settings role matrix and verify every mounted financial API operation against a positive allowed and negative denied test. Then turn to external release-readiness gates and any remaining browser/accessibility criteria; do not claim production readiness while staging grants, restore, monitoring, tax review and owner release approval remain unverified.

Next after publishing the membership viewer-denial change: reconcile the full mounted-route matrix (read/write/reference/export) against direct tests, then work through remaining acceptance gaps in AI draft-review UX, browser accessibility, tax review boundaries and operational security. Leave staging credentials, paid services, statutory policy and production rollout as owner-controlled gates.

Route audit: review `docs/ROUTE_SECURITY_MATRIX.md` against the actual current source after any route changes. Next test uncovered object-reference/role combinations and record no-side-effect evidence; then continue AI draft-review UX, browser accessibility, and release hardening without overclaiming production readiness.

Proceed with a review-only AI-assisted vendor-bill extraction workflow: explicit consent, tenant authorization, strict schema and input limits, clear uncertainty/provenance, editable fields, normal bill-draft validation, and no posting action. Then add route and UI tests proving AI output cannot post or persist without human submission.

## Active task — publish API response hardening and keyboard AI flow
Paginated GST readiness commit `15aef1f498405d645843b4a7bd4fc40484aa49c6` passed exact-SHA CI #505/#506, MongoDB #440/#441 and Browser #224/#225. The all-page review helper tests pass 5/5 and full suite passes 148/148.

GST pagination E2E commit `be3a907feea119718114be3c0030e891dd9aab87` passed CI #509/#510 and MongoDB #444/#445, but push Browser #229 failed at a locator that omitted the rendered product code; the accessible snapshot confirms both products were visible. The locator is corrected to match `code · name`, and provider-failure fallback coverage is included. Commit this fix on the current branch head and verify exact-SHA CI/MongoDB/Browser. Earlier API header SHA `f8ffcb0e4535cbc0e983b632b5e0cab39b353b1b` passed all six workflows. Full local replica-set suite passes 149/149; typecheck, lint, build, audit and diff checks pass.

Next: continue the remaining route role/reference review and keyboard/accessibility checks of responsive core workflows. GST statutory rates/codes, staging infrastructure, backup/restore, operational grants and production deployment remain unverified expert/owner gates. Do not state MVP or production readiness is complete until all acceptance criteria and external gates are verified.

## Active execution checkpoint — 2026-11-05

Remote branch `develop/phase-1-foundation` is at `2fd6eead14540685bf79ed3de512353905663f29`. Its exact-SHA CI #511/#512, MongoDB integration #446/#447 and Browser #230/#231 all passed. Continue in the clean worktree `D:\aslibooks-phase1`; the stale dirty worktree `D:\aslibooks-publish` is intentionally preserved. Never stage the owner-supplied vision document, merge PR #1, or deploy production.

Current implementation adds account group metadata and type-derived normal balance to the chart API and UI, validates group/type combinations, and extends route and browser regression tests. Verified locally: focused account replica-set tests 6/6; full replica-set workspace tests 137/137; typecheck, lint, production build, high-severity dependency audit and `git diff --check` pass. At `9180452dbc45a3db22799b4131de23fb437a075b`, push/PR CI #513/#514 and MongoDB #448/#449 pass; Browser #232/#233 fail only because a strict selector matches two expense cards. The selector is fixed by scoping to the created card. Rerun local quality checks, publish the correction, wait for all six exact-SHA workflows, and record their run numbers before advancing to persisted manual journal drafts.

Exact local verification commands (PowerShell, repository root):

```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:37491/?replicaSet=testset'
$env:MONGODB_TEST_DB_NAME='aslibooks_test_account_grouping'
pnpm --filter @aslibooks/api test -- src/routes/accounts.integration.test.ts
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm audit --audit-level=high
git diff --check
```

The running acceptance matrix remains partial. Qualified GST/accounting review, production credentials, database grants, backup/restore, monitoring, email deliverability, attachment malware/retention, and final security/accessibility review remain external release gates.

## Current checkpoint — persisted manual journal drafts

The chart-grouping and normal-balance slice is complete locally and remotely; exact SHA `ea3fbf4bcb691dea45e3ad3dae9203dfe2718157` passed CI #515/#516, MongoDB #450/#451, Browser #234/#235. The persisted journal draft commit `652366e32f52400e1597ad3e426d35a4a3e11928`, membership replay-fence SHA `079de81f4d567c2083918df2901bf66e25c5f385`, and closed-period rollback SHA `34f76c796398ffc48d9914fb59c4685cc6097c65` passed all six exact-SHA workflows. Foreign draft ID edit/post denial passed CI #523/#524, MongoDB #458/#459, and PR Browser #243 at `3dac4bd4cd90080d36ff778931d21dd805936c2e`; push Browser #242 remains in progress. A local model integrity guard and concurrent post/replay regression are added after that SHA; local typecheck/lint/build/audit pass, but MongoDB verification awaits a working replica set or the hosted run. Previous full suite 151/151 is verified before these added assertions. After those checks, continue the remaining route role/reference audit and responsive accessibility checks. Python/Playwright remains unavailable locally.

Validation commands (PowerShell, repository root):

```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:37491/?replicaSet=testset'
$env:MONGODB_TEST_DB_NAME='aslibooks_test_journal_draft_reauth_full'
pnpm --filter @aslibooks/api test -- src/routes/journals.integration.test.ts
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm audit --audit-level=high
git diff --check
```

Before a local full-suite retry, confirm `Test-NetConnection 127.0.0.1 -Port 37491 -InformationLevel Quiet` succeeds and use a unique `aslibooks_test_*` database. The last closed-period assertion focused run passed 2/2. After hosted checks pass, resume with a concrete uncovered operation/reference from `docs/ROUTE_SECURITY_MATRIX.md`; add focused no-side-effect integration coverage, run the full suite and quality commands above, then review keyboard/focus behavior at narrow viewport. Keep acceptance criteria partial while route permutations, external release gates, and statutory review remain incomplete.

## Next concrete task — accessible primary navigation
1. The Tab/Enter E2E assertion is published at SHA `4b2ce7129c764873b311530070db1dddb312e44d`; check its push/PR Browser runs. If it fails, inspect the exact run log and correct the selector or focus behavior.
2. A follow-up adds a named Primary navigation landmark and `aria-current="page"` to the active section; web tests 8/8, typecheck, lint, production build, and diff checks pass locally. Publish it and verify exact-SHA browser coverage for landmark naming, active section announcement, and keyboard movement.
3. Continue the targeted cross-tenant object-reference review on any still-uncovered mounted financial operation. Add denial and unchanged-state assertions, run local quality checks, then verify exact-SHA hosted tests.
4. Keep the product partial while GST policy review, staging grants/restore/monitoring, comprehensive accessibility, and owner-controlled release gates remain open.

Local checks for the current API cleanup correction:

```powershell
pnpm typecheck
pnpm lint
pnpm build
pnpm audit --audit-level=high
git diff --check
```

The product object-reference test is the active local slice. Once published, require exact-SHA MongoDB and CI success; then continue checking other route families for persisted foreign object IDs, especially operation routes that combine a local parent record with foreign child references. Keep report, navigation, and workflow results tied to their actual verified SHA.

Latest issue found: Browser #254/#255 at SHA `457ee8256f9dea693fe6b954054a3aae236e2c04` failed because the test queried the named navigation landmark while MUI's modal drawer made it unavailable to accessible-role queries. The assertion now checks the visible Accounting button directly. Publish the correction and rerun Browser; inspect logs again if Escape/expanded-state assertions fail.

The mobile menu keyboard/accessibility slice is complete through `b3566dfbe2fc493a66bc198af3d37b7991f1fa81` (all six CI/MongoDB/Browser runs passed). Continue with production origin configuration validation, then return to the mounted-route tenant/object-reference audit.

Current local slice: `openingBalances.integration.test.ts` uses a real foreign-tenant account ID against an otherwise authorized opening-balance request and asserts rejection without journal, opening record or audit writes. Typecheck, lint and diff checks pass; hosted MongoDB verification is required because the local replica set is unavailable. The production origin guard is complete through exact-SHA workflows above.

The foreign customer-advance reference test is the active slice. It must reject a peer tenant contact ID and preserve advance, journal, and audit counts. After publishing, verify exact-SHA MongoDB/CI and continue the same review for remaining untested operation references.

The prior `479e3d9` MongoDB run failed one expected-status assertion: a missing tenant-scoped customer reference returns 404 by design; the test incorrectly expected 422. The customer and vendor foreign-contact assertions now expect 404. Both verify advance/journal/audit counts remain unchanged. Typecheck, lint, and diff checks pass. Publish and verify the new exact SHA.

The current focused route-security slice tests foreign invoice/bill allocation IDs for customer/vendor advances. Each foreign record is seeded in a peer organization; the current tenant's active advance must get a 404 and leave allocation, journal, and audit state unchanged. Typecheck, lint, and diff checks pass. Hosted replica-set verification is pending.

Current local slice tests account/contact update and archive paths using real peer-tenant IDs, expecting 404 with the foreign record and tenant audit counts unchanged. Typecheck/lint/diff pass. Hosted replica-set verification awaits publication. Then resume route-reference checks or proceed to wider responsive accessibility coverage.
# Next: publish and verify pagination change

## Current active slice — permission regression follow-up (2026-11-06)

The source-receipt workflow commit `4f5683773ce4782943220413fba6ed3fca2ab1e7` is pushed to the development branch and all six exact-SHA CI/MongoDB/Browser push/PR workflows passed (recorded in `TEST_EVIDENCE.md`). The post-commit local follow-up adds direct proof that a viewer cannot upload a private receipt to an immediate expense; focused replica-set test and typecheck pass. Audit and acceptance docs now record the verified feature matrix and distinguish no staging rehearsal from hosted verification.

1. SHA `155c6a8` CI/MongoDB push/PR passed, but Browser push #42223125440 and PR #42223132144 failed because the new expense report assertion expected an outdated scenario baseline. The exact UI showed ₹54.66 before and ₹53.66 after the ₹1 expense. The assertion and log summary are corrected locally; publish and verify all six exact-SHA workflows.
2. A local follow-up extracts and unit-tests migration target confirmation (combined migration suites 2 files / 5 tests; typecheck and lint pass). Publish it after the corrected Browser result; run the full API suite on the resulting SHA.
3. Never stage `ASLIBOOKS_CODEX_VISION_AND_EXECUTION.md`; push only to `origin/develop/phase-1-foundation`. Never merge `main` or deploy production.
4. Next prepare a reproducible isolated backup/restore and monitoring evidence procedure using synthetic disposable data. Staging access, restore objectives, malware/retention policy, qualified tax/accounting review and release approvals remain owner/environment gates.

1. Finish the current `pnpm build`; rerun `git diff --check` and `pnpm lint` if edits change.
2. Push a feature commit to `origin/develop/phase-1-foundation` without staging the owner-provided vision document.
3. Verify exact-SHA CI, MongoDB, and Browser push/PR Actions; diagnose and repair any failure on a new commit.
4. Continue the product audit priorities: page receipt/payment histories, then evaluate additional customer-facing gaps; only add tests tied to these concrete gaps.
5. Staging work remains owner/environment dependent: staging secrets and infrastructure, approved backup/restore rehearsal, monitoring integrations and release/rollback exercise.

## Immediate next actions

1. Verify hosted Browser push/PR for `155c6a8`, then commit/publish the tested migration target guard and verify exact-SHA Actions.
2. Continue the data-protection release work with a reproducible synthetic backup/restore rehearsal and monitoring checks. Record tool/environment prerequisites and keep staging operations unverified until an actual authorized staging exercise occurs.
3. Preserve the master vision file, other worktrees, and the no-merge/no-production-deploy boundary.
