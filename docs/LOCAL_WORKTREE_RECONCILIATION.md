# Local Git worktree reconciliation

**Audit date:** 2026-11-07
**Scope:** read-only inventory and comparison of the five Aslibooks worktrees, the shared stash, and the owner-supplied vision document. No worktree, ref, stash, or file was modified during inspection. No commit, fetch, cherry-pick, merge, reset, clean, push, or test command was run. This report is the only audit write.

## Authoritative checkout

`D:\aslibooks` is on `codex/aslibooks-mvp` at `59c5a0cc83d792d349a6460aaeb854857e9fef58`. `git ls-remote origin refs/heads/develop/phase-1-foundation` returned the same SHA, so local `HEAD`, its tracking ref, and remote branch head are aligned.

Uncommitted authoritative-worktree state observed and preserved:

- Modified: `apps/web/package.json`, `pnpm-lock.yaml`, `docs/IMPLEMENTATION_STATUS.md`, `docs/MVP_ACCEPTANCE_MATRIX.md`, `docs/NEXT_ACTIONS.md`, `docs/TEST_EVIDENCE.md`.
- Untracked: `ASLIBOOKS_CODEX_VISION_AND_EXECUTION.md`.
- No staged changes were reported. The Playwright dependency and lockfile edits were left untouched. The vision document remains untracked and unstaged.

## Worktree inventory and divergence

| Path | HEAD / branch | Raw divergence from remote development | Patch comparison | Working-tree state |
| --- | --- | ---: | --- | --- |
| `D:\aslibooks` | `59c5a0c`, `codex/aslibooks-mvp` | 0 / 0 | Authoritative | Six modified paths and the untracked vision file listed above |
| `D:\aslibooks-next` | `3143046`, `codex/asli-next` | 57 ahead / 239 behind | 27 patch-equivalent commits; 30 patch-unique commits | 37 modified tracked files and 8 untracked files |
| `D:\aslibooks-phase1` | `817892e`, `codex/journal-drafts` | 0 ahead / 58 behind | Branch is an ancestor of the authoritative remote; no branch-only patches | One modified document: `docs/MVP_ACCEPTANCE_MATRIX.md` |
| `D:\aslibooks-publish` | `22eea51`, detached | 24 ahead / 128 behind | 12 patch-equivalent commits; 12 patch-unique commits | 15 modified tracked files and 4 untracked files |
| `D:\aslibooks-remote` | `8af3035`, detached | 5 ahead / 244 behind | All 5 branch-only commits are patch-equivalent upstream | Clean; no untracked files |

Counts use `git rev-list --left-right --count origin/develop/phase-1-foundation...<ref>` and `git cherry`. A patch-unique commit is only a nonmatching patch ID; it is not proof that its behavior is absent from the later authoritative tree.

## Findings by requested classification

### 1. Already implemented upstream

The following substantive worktree changes have corresponding current source, tests, or UI in `D:\aslibooks`:

| Worktree evidence | Current authoritative evidence | Assessment |
| --- | --- | --- |
| `aslibooks-publish/apps/api/src/ai/extractBillDraft.ts` and `.test.ts` | `apps/api/src/ai/extractBillDraft.ts`, `apps/api/src/ai/extractBillDraft.test.ts`, `apps/api/src/routes/bills.ts`, `apps/web/src/ExpensesScreen.tsx`; the source and unit-test content compare equal after normalizing line endings. `apps/api/src/routes/bills.integration.test.ts` covers role denial, the shared quota boundary, and no document/journal/audit writes. | AI bill suggestion workflow is already present, consent-gated, quota-limited, schema-validated, and does not post. No recovery needed. |
| `aslibooks-publish/apps/api/src/security/responseHeaders.ts` and `.test.ts` | `apps/api/src/security/responseHeaders.ts`, `apps/api/src/security/responseHeaders.test.ts`, and `apps/api/src/index.ts` where `apiResponseHeaders` is mounted. Both files compare equal after line-ending normalization. | Response-header hardening is already implemented and wired into the API. No recovery needed. |
| `aslibooks-publish/apps/web/src/gstReadiness.ts`, its test, and GST readiness screen changes | `apps/web/src/gstReadiness.ts`, `apps/web/src/gstReadiness.test.ts`, `apps/web/src/GSTReadinessScreen.tsx`, and the pagination assertions in `apps/web/e2e/chart.py`. The helper and unit test compare equal after line-ending normalization. | Catalog review loads subsequent pages, detects repeated cursors, and labels entered values without asserting tax compliance. No recovery needed. |
| `aslibooks-next/apps/api/src/accounting/gst.ts` and `.test.ts` | `apps/api/src/accounting/gst.ts` and `.test.ts` are content-identical to the next worktree versions. The current calculation returns fixed-discount and after-discount values and tests exclusive/inclusive inputs and invalid discounts. | GST arithmetic improvement is already present upstream. It remains arithmetic only; no GST compliance conclusion follows. |
| `aslibooks-next` security origin, health, API test configuration, invoice/bill idempotency, contacts, catalog, and financial UI diffs | Current `apps/api/src/security/trustedOrigins.ts`, `apps/api/src/routes/health.ts`, `apps/api/src/routes/{invoices,bills,contacts}.ts`, `apps/web/src/{ContactsScreen,ExpensesScreen,ReceiptsScreen,SalesScreen}.tsx`, `apps/web/e2e/chart.py`, and the current `vitest.config.ts` files contain later implementations and tests. `apps/api/src/routes/contacts.ts` and `apps/web/src/ContactsScreen.tsx` compare content-identical. | The branch’s commit subjects cover customer/vendor statements and pagination, service edit/archive, multi-line invoices, auth throttling, customer advance refunds, private attachments, replay handling, and browser selectors. Those functions are present in the authoritative tree; the branch’s patch IDs differ because it is an old divergent history. |
| `aslibooks-publish` patch-unique report packet and GST setup commits | `apps/web/src/printableReport.ts`, `apps/web/src/printableReport.test.ts`, `apps/web/src/ReportsScreen.tsx`, and current GST readiness files. | The report print packet and entered-field GST review already exist. |
| `aslibooks-remote` five branch-only commits, including ledger CSV, fiscal close checklist, email-flow, and GST setup work | Current `apps/web/src/ReportsScreen.tsx`, `apps/api/src/routes/reports.ts`, `apps/web/src/FiscalPeriodsScreen.tsx`, `apps/api/src/routes/fiscalPeriods.ts`, auth/email files, and GST setup screen contain the corresponding later features. All five commits are patch-equivalent to the authoritative branch. | Old clean reference checkout; no files or commits need recovery. |

### 2. Potentially worth preserving for targeted review

No missing customer-facing feature was established by comparing the current source against the worktree contents. `aslibooks-publish` has 12 patch-unique commits, mostly tenant-boundary and role tests (for example `eedbbad` financial-resource tenant scope, `6fe3d71` route boundaries, `9b89c4e` foreign receipt cash accounts, `b4d3539` advance permissions, `aa2783a` journal permissions, and `aafbc44` admin period close). Current suites contain corresponding assertions in `apps/api/src/routes/{bills,fiscalPeriods,organizationSettings,transfers,attachments,contacts,reports,invoices,memberships,receipts,customerAdvances,vendorAdvances,journals,accounts,products}.integration.test.ts`; `docs/ROUTE_SECURITY_MATRIX.md` and `docs/MVP_ACCEPTANCE_MATRIX.md` record the current scope and remaining non-exhaustiveness.

These commit patches may be retained as reference material for a later assertion-by-assertion gap review, but the audited evidence does not justify replaying them wholesale. The same applies to `aslibooks-next`’s 30 patch-unique historical commits: feature parity is visible in current source, while its working-tree overlay contains regressions described below.

### 3. Obsolete, conflicting, experimental, or unsafe

**Do not recover `D:\aslibooks-next\apps\api\src\security\trustedOrigins.ts` or its corresponding test over the authoritative version.** Its dirty implementation reduces `configuredTrustedOrigins` to comma splitting and trimming. It removes the production requirement for `WEB_ORIGIN`, HTTPS enforcement, URL parsing, and rejection of credentials, paths, queries, and fragments. The dirty test also removes assertions for those production checks. The authoritative implementation in `apps/api/src/security/trustedOrigins.ts` retains these safeguards, and `apps/api/src/security/trustedOrigins.test.ts` verifies them.

The `aslibooks-next` worktree is not a safe file-copy or merge source. Diffs against current source show that its dirty `apps/api/src/routes/bills.ts` omits current bill cursor pagination and AI assistance; its `apps/web/src/ExpensesScreen.tsx` omits current bill/payment/expense pagination, AI assistance, cash expenses, and multi-bill payment allocations; and its `apps/web/src/ReceiptsScreen.tsx` regresses to a single-invoice receipt allocation and omits current list pagination. Current implementations are in `apps/api/src/routes/bills.ts`, `apps/web/src/{ExpensesScreen,ReceiptsScreen}.tsx`, and are exercised in `apps/web/e2e/chart.py`. Its `apps/api/src/index.ts` also predates the authoritative response-header middleware and safe error logging. These are regressions from starting with an older base, not reasons to replace current files.

The `aslibooks-next` manifest/lockfile diffs include a Vitest upgrade and a minimatch override, but the authoritative branch already has the current test configs and dependency state. Copying that lockfile would risk replacing the aligned authoritative dependency graph. Its broad README, architecture, security, deployment, progress, and acceptance-matrix changes describe older checkpoints and conflict with later status evidence.

The current and worktree copies of `apps/web/src/gstReadiness.ts` detect repeated cursors but do not bound the number of distinct pages. This is a shared implementation limitation, not a unique recovery from a secondary worktree; consider a page/request ceiling in a future implementation pass.

**Resolution after review:** the authoritative checkout now bounds this traversal to 100 pages (10,000 products at the API’s maximum page size), errors visibly at the limit, and has a focused test proving an endless sequence of distinct cursors stops after 100 requests. No secondary worktree content was used.

### 4. Documentation-only differences

- `aslibooks-phase1` changes only `docs/MVP_ACCEPTANCE_MATRIX.md`; it refers to older `b3111f7` checks as queued/pending and predates the current report/status evidence. Treat it as stale historical text.
- `aslibooks-next` changes `README.md` and docs including `ARCHITECTURE.md`, `DECISIONS.md`, `DEPLOYMENT.md`, `IMPLEMENTATION_STATUS.md`, `NEXT_ACTIONS.md`, `SECURITY.md`, `TEST_EVIDENCE.md`, and `development.md`, plus an untracked acceptance matrix. Their checkpoint and pending-work claims predate the current authoritative docs; do not copy them over current docs wholesale.
- `aslibooks-publish` changes `IMPLEMENTATION_STATUS.md`, `MVP_ACCEPTANCE_MATRIX.md`, `NEXT_ACTIONS.md`, `ROUTE_SECURITY_MATRIX.md`, `SECURITY.md`, and `TEST_EVIDENCE.md`. They contain useful historical evidence but old “pending” and “in progress” labels. Current docs are newer; transfer only a verified missing evidence detail after checking its exact SHA/run.
- `aslibooks-remote` is clean and has no documentation-only working-tree diff.

## Shared stash and owner vision preservation

Every worktree exposes the same stash entry because they share the repository’s common Git directory: `f4e231416f412fb7e1d4c3290679dfd256105bb2`, created as `preserve Aslibooks workspace changes before verified remote sync`. It contains a tracked snapshot across 21 paths and an untracked third-parent tree of 8 paths. The untracked tree includes `ASLIBOOKS_CODEX_VISION_AND_EXECUTION.md`, GST/email/membership files, and `apps/web/src/TeamScreen.tsx`. Its vision-document text matches the authoritative untracked copy after line-ending normalization. The stash was only listed and read; it was not applied, dropped, or altered.

## Recommended recovery and safety actions

1. Keep all five worktrees and the shared stash intact. No reset, cleanup, cherry-pick, merge, commit, or push is indicated by this audit.
2. Continue treating `D:\aslibooks` at `59c5a0c` as authoritative. Do not overlay the stale `aslibooks-next` worktree; specifically reject its relaxed trusted-origin implementation.
3. Do not recover the AI, response-header, GST-readiness, printable-report, ledger-export, or account-role features from secondary trees; corresponding implementation and test files already exist upstream.
4. If additional security-test breadth is desired, compare the 12 patch-unique `aslibooks-publish` test commits to current assertions individually. Avoid importing their historical documentation and verify every recovered test on an isolated disposable replica set.
5. Preserve the authoritative uncommitted Playwright manifest/lock changes, the four modified status/evidence documents, and the owner vision file. This audit did not stage or commit any of them.

## Method and limits

Inspection used local `git status --no-optional-locks`, `rev-parse`, `rev-list`, `merge-base`, `cherry`, `ls-tree`, `show`, `diff`, `ls-remote`, and read-only file comparisons. The remote branch tip was read without fetching. No Actions were rerun and no source/test behavior was executed because the requested audit was read-only. Patch-ID equivalence does not establish semantic correctness; conclusions about semantic overlap above are based on the named current source, route, UI, test, and documentation files.
