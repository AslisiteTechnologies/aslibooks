# Implementation plan

PR #1 is the delivery branch. The evidence ledger is in [PROGRESS.md](PROGRESS.md). A green workflow verifies the cases present at that commit.

| Order | Dependency | Deliverable | Acceptance evidence |
| --- | --- | --- | --- |
| 0 | Existing foundation | Reproduce setup, inspect sessions, fences, indexes, deletion guards and scoped cleanup | Frozen install, build, unit and replica-set suites. Every tested mutation fails and persisted lines survive. Both mandatory workflows pass for the pushed SHA. |
| 1 | 0 | Select active organization and manage its chart of accounts | Anonymous, viewer, suspended and foreign writers denied. Duplicate codes rejected per tenant. Safe metadata edits, protected system/posted accounts, auditable changes and browser coverage. |
| 2 | 1 | Financial years, lock periods, membership administration and manual journals | Verified session actor, concurrent close/revoke and post serialize. Journal/reversal HTTP replay returns one result. Actor and period visible in audit. |
| 3 | 1–2 | Customer/vendor contacts, draft documents, issue/approve | Totals in integer paise, tenant/year numbering, explicit approval and transactional journal with source ID. Concurrent requests create one posting. |
| 4 | 3 | Receipts, vendor payments and allocations | Partial payments reconcile. Over-allocation and concurrent settlement cannot leave partial writes. |
| 5 | 2–4 | General ledger, trial balance, P&L, balance sheet and aging | A dated golden month reconciles to posted entries, including reversal, payment and closing balances. |
| 6 | 1–5 | Browser and staging acceptance | Real sign-in → organization → invoice → receipt → reports plus permission denial. Small-screen and keyboard checks. Restore and rollback rehearsal. |
| 7 | Deterministic flows, provider decision | Optional human-reviewed AI drafts and mobile scaffold | Provider errors cannot create entries. No automatic posting. Mobile roadmap separate from web release. |

## Decisions and dependencies

Keep Better Auth, Express, Mongoose and integer INR paise. Implement the chart before exposing posting so a user can supply valid accounts without database access. Account archival and period locking must serialize with financial writes. Do not ship a read-then-update archive check in isolation. Keep tax handling behind approved rounding and tax-treatment examples. Select a staging target and credentials with the owner before claiming deployment. The mobile directory currently contains a README only.
