# Aslibooks product audit — 2026-11-06

## Latest execution checkpoint

At this update, local `HEAD` and `origin/develop/phase-1-foundation` are both `719cf9358f034e640775bb962666618dc7d30b61`; all six exact-SHA CI/MongoDB/Browser push and PR checks passed. The migration-target confirmation guard is committed and hosted-tested. The latest supported non-tax golden workflow includes receipt attachment, cash expense and report reconciliation. A realistic synthetic account-setup-to-bank-reconciliation UI flow was previously executed; report assertions and source records reconcile to exact journals. Staging-ready is not established: no hosted staging, restricted grants, backup/restore rehearsal, monitoring/alert or rollback exercise has been performed. Production approval remains false, and tax-bearing workflows are not represented as GST compliant.

This audit records the current `codex/aslibooks-mvp` checkout at base SHA `4e3dd782f42b173eba2b1a3c4ba1e94d1006e808`, plus the uncommitted changes listed in the current implementation checkpoint. It does not include dirty changes from the other preserved worktrees. The owner-supplied `ASLIBOOKS_CODEX_VISION_AND_EXECUTION.md` is deliberately untracked.

## Repository and hosted verification

- `origin/develop/phase-1-foundation` was observed at `4e3dd782f42b173eba2b1a3c4ba1e94d1006e808`; the local development checkout is on `codex/aslibooks-mvp`.
- Separate worktrees exist at `D:\aslibooks-next`, `D:\aslibooks-phase1`, `D:\aslibooks-publish`, and `D:\aslibooks-remote`. They were inspected and left intact; several contain unrelated dirty or divergent changes.
- At base SHA `4e3dd78`, push and pull-request CI, MongoDB integration, and Browser end-to-end workflows all completed successfully: runs `42204798442`, `42204798469`, `42204798543`, `42204807800`, `42204807706`, and `42204807676`.
- Local synthetic end-to-end work identified a defect in importing multiple bank statement rows inside one MongoDB transaction. The route now creates those documents with ordered transactional inserts. A focused replica-set regression verifies import and duplicate replay of two rows.

## Realistic local UI scenario

Run against a disposable local MongoDB replica set with synthetic data only. The actual React UI completed registration, company creation, starter chart setup, contact and service setup, invoice issue, two partial receipts, bill posting, vendor payment, internal cash-to-bank transfer, CSV import, matching, and reconciliation.

The financial statement cut-off was 2026-11-06. Currency amounts below are INR; source amounts are integer paise.

| Source document / event | Posted journal | Debits | Credits |
| --- | --- | ---: | ---: |
| Issued invoice `ASL/2026-27/00001`, paid ₹400 | `6aedb231d4fb66fedb35c0cb` | AR ₹400 | Sales ₹400 |
| Customer receipt 1 | recorded in receipt journal | Cash ₹200 | AR ₹200 |
| Customer receipt 2 | recorded in receipt journal | Cash ₹200 | AR ₹200 |
| Vendor bill `RENT-2026-11-01` | `6aedb293d4fb66fedb35c158` | Rent ₹100 | AP ₹100 |
| Payment of vendor bill | `6aedb2a3d4fb66fedb35c174` | AP ₹100 | Bank ₹100 |
| Cash-to-bank transfer | `6aedb2b6d4fb66fedb35c19b` | Bank ₹100 | Cash ₹100 |

All six posted journals were individually balanced. The two customer receipts were separate ₹200 allocations to the same invoice; exact receipt journal IDs are present in the disposable test database and are not used as durable environment identifiers. Statement lines imported: 2; duplicate retry skipped: 2; both lines matched to existing posted journals and reconciled. Reconciliation covered 2026-11-01 through 2026-11-06 with opening and closing bank ledger balances of ₹0.

| Report / control | UI result | Underlying reconciliation |
| --- | ---: | --- |
| Trial balance | Debits ₹400 = credits ₹400 | Sum of posted journal lines; balanced |
| Profit and loss | Revenue ₹400; expense ₹100; profit ₹300 | Invoice sales less posted rent bill |
| Balance sheet | Assets ₹300; liabilities ₹0; current earnings ₹300 | Cash ₹300 + bank ₹0 + AR ₹0; AP ₹0 |
| Receivables / payables aging | ₹0 / ₹0 | Invoice and bill both fully settled |
| AR/AP control reconciliation | Difference ₹0 / ₹0 | Control accounts equal open source documents |
| Cash general ledger | Ending debit ₹300 | ₹200 + ₹200 receipts less ₹100 transfer |
| Bank general ledger | Ending ₹0 | ₹100 vendor payment plus ₹100 transfer |

## Feature matrix

`Functionally complete` means the principal workflow exists in this MVP scope. `Tested and verified` records direct evidence and its boundary. `Staging-ready` and `Production-approved` are independent gates; neither is implied by code completion or CI.

| Capability | Functional state | Tested and verified | Staging-ready | Production-approved |
| --- | --- | --- | --- | --- |
| Registration, login, organization creation, membership and roles | Functionally complete for implemented roles and flows | Hosted Browser/CI/MongoDB evidence at documented SHAs; fictional local UI registration and organization creation | No staging environment or live email configuration verified | No owner release approval |
| Chart of accounts, opening balances, journals, fiscal periods | Functionally complete for supported INR ledger flows | Unit, replica-set, role and hosted CI evidence; synthetic UI scenario posted and balanced journals | Requires staging grants/index rollout and backup/restore rehearsal | No independent accountant sign-off or owner release approval |
| Contacts and products/services | Functionally complete for basic customer/vendor/service records | Browser and API suites; local synthetic customer, vendor and service setup | No staging environment verified | No owner release approval |
| Sales invoices, receipts, credit notes, advances/refunds | Functionally complete for supported non-tax invoice lifecycle | Hosted routes/browser and local synthetic issue, partial receipts and full settlement; multi-invoice single-remittance UI is included in the hosted Browser journey | No staging environment verified | No tax/accounting sign-off; no owner release approval |
| Vendor bills, immediate expenses, payments, credits, advances and attachments | Functionally complete for supported non-tax purchase flows | Hosted tests and local synthetic posted bill/payment/immediate expense; private immediate-expense receipt attachment and tenant paths pass exact-SHA CI/MongoDB/Browser at `4f568377` | Malware scanning/retention decisions and staging rehearsal remain | No owner release approval |
| Bank CSV, matching, transfer and reconciliation | Functionally complete for the supported CSV and reconciliation workflow | Local UI imported two rows, replay skipped both duplicates, matched journals and reconciled; corrected multi-row import has hosted exact-SHA CI/MongoDB/Browser verification | Staging database and operational monitoring unverified | No owner release approval |
| General ledger, trial balance, P&L, balance sheet, aging and controls | Functionally complete for implemented report set | Local synthetic UI scenario reconciles to exact source journals/docs; hosted role and report verification at documented SHAs | No staging environment verified | No independent accounting sign-off or owner release approval |
| GST | Partial; deterministic data and tax snapshots exist, tax-bearing posting remains blocked | Unit, API and browser guard tests; no real tax posting | No qualified India tax review or official rate data | Do not claim GST compliance; approval absent |
| AI bill/report assistance | Partial and explicitly review-gated | Hosted tests verify consent, validation, quotas, uncertainty and no AI-triggered bill post | Live provider configuration/retention review and staging controls absent | No owner/provider approval |
| Accessibility and responsive UI | Partial | Hosted axe WCAG 2.1 A/AA scans passed at documented SHA; local UI was exercised at desktop viewport | Manual keyboard, focus and screen-reader review remains | No owner acceptance |
| Backup, restore, monitoring, incident response | Missing operational evidence | Procedures are documented; no staging rehearsal observed | Not staging-ready until rehearsal and monitoring are exercised | Not approved |

## Highest-impact customer workflow gap and active implementation

The receipt API already accepts up to 50 invoice allocations for a single customer, while the customer-facing form only sent one. This prevented representing a single remittance applied to multiple invoices. The current UI change adds/removes allocations, filters out duplicate invoices, limits choices to one customer, defaults each amount to the available balance, validates each balance, and previews the summed receipt before the existing confirmation/post boundary. Typecheck, lint and production build pass. The first hosted Browser attempt failed because its new test reused a customer that an earlier test intentionally archived; the fixture now creates fresh synthetic customer/vendor contacts before the new flow. Corrected hosted Browser verification is pending.

The same audit found the API already supports multiple bill allocations in a vendor payment while the UI only exposed one bill. A corresponding payment UI now supports distinct same-vendor bills, validates each outstanding amount and preserves the idempotency key across response loss. Typecheck, lint, web tests and production build pass; the Browser scenario now posts two synthetic bills and pays them in one transaction. The first hosted attempt caught an ambiguous test selector (`Vendor` resolves to the bill form, advance and advance allocation fields); the E2E now targets the first bill-form selector. Product behavior remains pending hosted Browser verification.

## Operational tooling and verification

The API provides `pnpm --filter @aslibooks/api db:ensure-indexes`; it successfully ensured indexes for the declared Mongoose models against a disposable replica-set database. It creates missing declared indexes without dropping indexes or rewriting data. A versioned forward-only migration runner is now implemented locally, with database-target confirmation, version ledger, unknown-version protection, and restart-safe replay tests. The registry remains empty because no current data transformation is needed; no migration was run outside a disposable database.

The complete API replica-set suite passed 35 files / 142 tests with an increased 20-second timeout. Accounting passed 5/5, web passed 8/8, and typecheck, meaningful lint, production build, high-severity audit and `git diff --check` passed locally. An initial concurrent run produced one five-second test timeout while the new multi-line bank import test passed; the focused serial bank suite then passed 2/2, and the complete API suite passed serially. Exact-SHA Actions for the new local changes are pending.

## Staging and release state

Configuration, integration-testing, deployment, security, and release-checklist documentation exists in the repository. No staging deployment, staging database grant validation, backup/restore rehearsal, monitoring exercise, or release rollback has been performed. Therefore Aslibooks is an actively developed MVP with verified local and hosted paths, not a staging-verified or production-approved system.

## Next executable work

1. Resolve all findings from the current full local replica-set run; verify `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm audit --audit-level=high`, and `git diff --check`.
2. Add Browser coverage for multi-invoice receipt allocation and verify it against hosted exact-SHA workflows.
3. Commit only reviewed Aslibooks source/docs/test files, excluding the owner-supplied vision file; push only to `develop/phase-1-foundation`, never `main`.
4. Verify all six workflows on the exact pushed SHA and fix any failure.
5. Continue the next remaining high-impact workflow gap and make staging procedures runnable without claiming a staging rehearsal that has not occurred.

## Audit addendum — 2026-11-06 continuation

The cursor-pagination implementation has advanced beyond the original audit snapshot:

- Invoice list paging uses the existing validated cursor and is exposed in Sales and customer receipts. This keeps older open invoices reachable from allocation selectors.
- Bills, receipts and vendor-payment history now expose validated cursor endpoints and load-more controls. Tenant-scoped compound indexes support these query paths and are handled by the existing explicit index-preparation command.
- Bill cursor traversal, malformed-cursor rejection, web behavior and exact accounting workflow regression have local replica-set verification. The subsequent receipts/payment route changes pass local bill+receipt integration tests (8/8), web tests (8/8), typecheck, lint, production build, and index preparation across all 26 models.
- Commit `5679dbe03d49ca1ea43641c79fd6f09064d01a8d` passed all six exact-SHA push/PR Actions: CI `42213609963` / `42213615848`, MongoDB `42213610102` / `42213615943`, Browser `42213610002` / `42213615860`.
- Settlement-history follow-up `6cf0f15bad9d9b3936b7169bc746b298cc755cf6` added receipt and vendor-payment history cursors. Follow-up `3add45292419019df18c9de66214d171655d4957` added local regression for complete two-record traversal; its push CI/MongoDB/Browser and PR CI/MongoDB passed. Documentation-only SHA `857826609f88f8f40549fac85ca89d352652a3e0` then passed all six exact-SHA Actions: CI #625/#626, MongoDB #560/#561, Browser #344/#345. No database data migration was needed; only declared indexes were added.

The product feature matrix above remains a snapshot of functional scope, not a claim that the service is staged or production approved. Staging infrastructure, secrets, backup/restore exercise, monitoring validation, rollback rehearsal, independent accounting/tax review and owner release acceptance remain unverified or owner-dependent.

### Immediate purchase expense workflow

The audit found that Expenses supported unpaid supplier bills and vendor payments but lacked a straightforward record for a purchase paid at the point of sale. Added `/cash-expenses` with tenant-scoped read, cursor-paged history, active account validation, a transaction-fenced posting permission, integer-paise validation, immutable source record, idempotent replay, balanced expense/cash journal lines, fiscal-period control and audit events. The Expenses screen now separates immediate cash/bank expenses from unpaid bills and requires an explicit review/confirmation before posting. The local integration test passes against a disposable replica set; the full API suite passes 36 files / 144 tests; web tests 8/8, typecheck, lint, production build and 27-model index preparation pass. The synthetic Browser path and CI/MongoDB all passed at exact SHA `e8b06668b4ee31bdeea8cebae5e42e0ac45df48f` (CI #629/#630, MongoDB #564/#565, Browser #348/#349). No GST tax is inferred or recorded by this path.

## Repository and source-receipt audit refresh — exact SHA `4f5683773ce4782943220413fba6ed3fca2ab1e7`

The local branch is `codex/aslibooks-mvp`, tracking the shared development target `origin/develop/phase-1-foundation`; both local and remote point to `4f5683773ce4782943220413fba6ed3fca2ab1e7`. Other worktrees were left untouched. The only untracked item remains the owner-supplied master vision document. Six exact-SHA checks passed: CI #42219754245/#42219760826, MongoDB #42219754307/#42219760834, Browser #42219754384/#42219760843. The API replica-set suite passes 36 files / 144 tests; web 8/8, typecheck, lint, build, high-severity audit, and diff check pass locally.

Immediate expenses now support tenant-scoped private receipt PDFs/images through the same attachment panel used for invoices and bills. The real UI Browser path uploads a synthetic receipt; route tests cover source ownership and peer-tenant denial. A viewer-upload denial assertion added after `4f568377` passed locally and all six exact-SHA workflows at `575dc89`.

### Current report-reconciliation candidate — `155c6a833a6f62bf3f30dc7b7bbe0d5e70c7d162`

The local and remote development ref now point to `155c6a8`. Its CI and MongoDB push/PR workflows have passed; Browser push/PR failed because a newly added UI assertion expected an earlier profit baseline. Hosted UI evidence shows the final full scenario at ₹54.66 before the separate ₹1 expense and ₹53.66 after; the Browser assertion is corrected locally. Local full API verification passes 37 files / 147 tests, web 8/8, typecheck/lint/build, high-severity audit and diff checks. The committed route-driven golden fixture includes the immediate-expense source/journal and reconciles precise ledger/report totals. The migration-runner parent SHA `5f15b61` has all six workflows green. No staging exercise has occurred and production is not approved.

Supported non-tax accounting workflows are functionally complete and tested at documented SHAs. Staging-ready has not been established because staging grants/configuration, restore rehearsal, monitoring/rollback exercise, and release rehearsal have not happened. Production approval remains absent. Tax-bearing posting must remain blocked pending qualified policy review.

## Explicit state separation

| State | Verified scope | Evidence / boundary |
| --- | --- | --- |
| **Fully working** | Supported non-tax invoice/bill posting and settlement, receipt/payment allocation, bank import/matching/reconciliation, core reports, audit/role boundaries, and now cursor-paged transaction histories | Synthetic UI golden flow and source-journal reconciliation above; route suites and exact-SHA runs recorded in `docs/TEST_EVIDENCE.md`; latest implementation locally passes the focused replica-set tests. |
| **Partially working** | GST-ready fields and deterministic calculations; constrained AI draft/explanation; responsive web | Tax-bearing invoice issuance remains deliberately held pending qualified review; AI bill parsing only assists a draft and there is no live provider credential evidence; automated WCAG scans pass but manual review and wide-device support acceptance remain. |
| **Missing** | Subscription billing/plan entitlements, organization-level bulk export/deletion workflow, and native mobile app | No subscription or organization export/deletion product workflow exists in `apps/api/src/routes` / `apps/web/src`; no Expo/native app exists. Core report and contact-statement CSV exports are present. Native mobile, subscriptions and advanced integrations are explicitly later scope in master vision §5J/§6 Phase 7. |
| **Externally blocked / not verified** | Real staging release and production approval, backup/restore rehearsal, monitored rollback, live transactional email/provider behavior, independent tax/accounting review | Requires staging infrastructure/secrets and operational access or qualified owner review. Runbook documentation is present, but no staging exercise or deployment has been performed. |
