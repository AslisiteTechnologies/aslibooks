# Next actions

## Current checkpoint

Branch `develop/phase-1-foundation`. Published fiscal-period checkpoint `2f0125ad65944878732ba29b150bd56b72b38c44`; CI #188 and MongoDB #125 succeeded. Manual journal endpoints and MUI workflow are the active local slice. Do not rewrite history or force-update the branch. Preserve the untracked `ASLIBOOKS_CODEX_VISION_AND_EXECUTION.md` supplied by the owner.

## Verify current changes

1. Finish full workspace tests with `MONGODB_TEST_URI=mongodb://127.0.0.1:37491/?replicaSet=aslibooksLocal` and `MONGODB_TEST_DB_NAME=aslibooks_test_<unique_name>`.
2. Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, browser smoke and `git diff --check`.
3. Commit and publish manual journal work to `develop/phase-1-foundation`; inspect CI and MongoDB integration for the exact resulting SHA.

## Next implementation sequence

1. General ledger and trial balance read APIs, exact seeded balance assertions and connected screens.
2. Account starter chart, controlled opening balances and organization fiscal settings.
3. Contact edit/details, invoice draft and issue lifecycle with transactional source journal and number sequencing.
4. Bill/expense workflows, receipts/payments and allocations; then reports reconciling to ledger.
5. Tax-ready data structures with reviewed validation only, security hardening, responsive end-to-end coverage and release operations.

No production deploy, merge to `main`, real customer data use or compliance claim is authorized by the development request.
