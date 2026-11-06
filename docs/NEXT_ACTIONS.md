# Next actions

## Active checkpoint — warning contrast and expanded a11y coverage (2026-11-06)

At `4ccb0d7`, CI #575/#576 and MongoDB #510/#511 passed; Browser push #294 passed. Browser PR #295 found warning text contrast in Expenses. The warning palette was darkened to `#a64b00`, and the browser flow now scans Products, Receipts, Banking, GST, fiscal close, Settings and Team. On `d9b8ff2`, Browser push #296 found an unnamed fiscal-close progress bar; `CircularProgress` elements in the app now have accessible names. Browser PR #297 was still running at last check. Web tests, lint, typecheck, build and diff passed before the latest progressbar fix. Local Playwright runtime exists but local MongoDB/Container engine is unavailable, so hosted E2E provides journey verification. Commit/push and verify all six workflows; keep fixing findings. Manual accessibility review stays open.

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
