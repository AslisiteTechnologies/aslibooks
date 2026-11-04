# Next actions

## Active local slice

Chart of accounts. GitHub development HEAD is `1f7c76f0573918d88a3164c80548440e12cf26c1`. Preserve all uncommitted account work and the untracked master vision file. Do not reset the checkout.

## Exact verification

Run `pnpm typecheck`, then `$env:MONGODB_TEST_URI='mongodb://127.0.0.1:37491/?replicaSet=aslibooksLocal'; $env:MONGODB_TEST_DB_NAME='aslibooks_test_asli'; pnpm --filter @aslibooks/api test`, then `pnpm test`, `pnpm build`, `pnpm lint`, and `git diff --check`. Use MongoDB 7 replica-set support; isolated database names must start with `aslibooks_test_`. The local listener is loopback port 37491. Verify it before tests.

## Highest-priority next task

Fix and verify the signup → company → chart browser smoke test. The previous helper invocation timed out because it launched API through `pnpm.cmd` under PowerShell without receiving the server's environment. Run API and web as separate hidden processes with explicit inherited environment or use the helper from a compatible shell. Verify startup logs and HTTP readiness before Playwright. Browser runner is Python 3.12 at `%USERPROFILE%/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`, Playwright modules at `%TEMP%/codex-aslibooks-playwright`, and Chromium at `%TEMP%/codex-aslibooks-browsers`.

After E2E, commit the verified account slice, push only if credentials allow, and check both workflows on that exact SHA. Then build tenant-scoped contacts and basic products/services, followed by draft and issued sales invoices and source-linked posting. Do not claim invoice workflow until payment allocation, journals and reports complete the accepted end-to-end path.

No production deploy, main merge, live database changes or compliance claims.
