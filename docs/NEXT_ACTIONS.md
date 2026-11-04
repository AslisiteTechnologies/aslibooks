# Next actions

## Current checkpoint

Branch `develop/phase-1-foundation`. Latest local feature commit before the in-progress fiscal-period work: `dbe282915bc153bf6ce12087cfceee4260aa9408`. The latest known published development branch SHA is `f74dc1051725bd63707a1bcfc1d477a87ca48d50`; check the live remote before publishing. Do not rewrite history or force-update the branch. Preserve the untracked `ASLIBOOKS_CODEX_VISION_AND_EXECUTION.md` supplied by the owner.

## Verify current changes

1. Finish `pnpm --filter @aslibooks/api test` with `MONGODB_TEST_URI=mongodb://127.0.0.1:37491/?replicaSet=aslibooksLocal` and `MONGODB_TEST_DB_NAME=aslibooks_test_<unique_name>`.
2. Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`, and `git diff --check`.
3. Verify the chart browser smoke flow with the configured local MongoDB replica set and Playwright Chromium.
4. Commit the product/runtime and fiscal-period work, publish by fast-forward to `develop/phase-1-foundation`, and inspect CI and MongoDB integration checks for the exact resulting SHA.

## Next implementation sequence

1. Authenticated journal list/detail/manual posting/reversal endpoints with role checks, server-derived actors, fiscal period enforcement, idempotency and audit.
2. General ledger and trial balance read APIs, exact seeded balance assertions and connected screens.
3. Account starter chart, controlled opening balances and organization fiscal settings.
4. Contact edit/details, invoice draft and issue lifecycle with transactional source journal and number sequencing.
5. Bill/expense workflows, receipts/payments and allocations; then reports reconciling to ledger.
6. Tax-ready data structures with reviewed validation only, security hardening, responsive end-to-end coverage and release operations.

No production deploy, merge to `main`, real customer data use or compliance claim is authorized by the development request.
