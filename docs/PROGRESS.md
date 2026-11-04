# Engineering progress

## 2026-11-04 · foundation audit

- Baseline development and draft PR head `8d7a994e15bd4a4af3244411096113a1f8c1e41b`. [CI #181](https://github.com/AslisiteTechnologies/aslibooks/actions/runs/41776328042) and [MongoDB integration #118](https://github.com/AslisiteTechnologies/aslibooks/actions/runs/41776327975) succeeded on that revision. [Draft PR #1](https://github.com/AslisiteTechnologies/aslibooks/pull/1).
- Checkout contained an untracked pnpm lockfile. Frozen installation with pnpm 10.18.0 succeeded. GitHub uses Node 22. Local Node is 24.13.0.
- Verified actual code against older handoff notes. Better Auth sign-up, cookie session, logout, sign-in and cross-tenant organization list tests exist. Authorized journal/reversal services fence the active membership inside MongoDB transactions. At baseline only organization routes expose business data.
- Audit found model-level mass deletion and document deletion unguarded. Added middleware and regression assertions alongside bulk-write and persisted-value checks. Test-only cleanup uses raw collection access scoped to fresh fixture IDs or tenant.
- Existing tests share some ordered fixtures. Root lint delegates to Turbo and no workspace declares a lint task. No formatter script. Browser journeys, staging and restore rehearsal still require evidence.
- Next dependency is the organization-scoped chart, followed by period controls and manual journal HTTP/UI. See [implementation plan](IMPLEMENTATION_PLAN.md).
- Local hardening verification: typecheck, 26 unit tests and workspace build passed. A new loopback-only MongoDB 7.0.16 replica set ran all 61 API tests (40 database cases and 21 unit cases), including scoped teardown. Matching ordinary-journal payloads can no longer replay a reversal. The original lockfile is tracked unchanged for frozen CI installs.
