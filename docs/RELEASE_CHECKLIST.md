# MVP release checklist

Local auth-shell manual review (2026-11-07) covers keyboard order, focus indication, offline error messaging and retry only. It does not close the complete keyboard/screen-reader/focus item below. Full app review requires the API and an isolated disposable replica set; manual assistive-technology review remains outstanding.

For each gate attach the exact tested SHA, environment, run link and reviewer. [PROGRESS.md](PROGRESS.md) records verified revisions.

- [ ] CI and MongoDB integration succeed on release candidate (frozen install, typecheck, lint, unit, build, high-severity dependency audit, real replica-set tests).
- [x] CI, MongoDB and Browser Actions use supported Node runtimes and complete without deprecated action-runtime warnings on exact SHA `e45532d2b36c51f0999e852f6c29e8a2ab2b8d02` (CI #665/#666, MongoDB #600/#601, Browser #384/#385). Recheck on the eventual release candidate.
- [ ] Browser completes sign-in, tenant selection, financial year, membership and role denial.
- [ ] Chart, contacts, sales, bills, receipts and vendor payments cover audit, tenancy, retries and concurrent changes.
- [ ] Manual journals, closed periods and reversals pass atomicity and immutability checks.
- [ ] Golden business month reconciles across GL, trial balance, P&L, balance sheet and aging.
- [x] Hosted synthetic browser journey reconciles financial source documents to statements and verifies the full organization archive and original attachment bytes on exact SHA `92720a2c0ac7f62de1846e7730be026b62670fe6` (Browser push #42361955780, PR #42361971452). This archive is unencrypted and best-effort; data policy, staging backup/restore and release gates remain open.
- [ ] Browser completes onboarding → invoice → partial receipt → reports on desktop and mobile viewport.
- [ ] Automated WCAG 2.1 A/AA scans pass on key browser workflows; manual keyboard, screen-reader, focus, and contrast review is recorded.
- [ ] Security review covers session expiry, abuse controls, redaction, advisories, grants and restore rehearsal. Application API/operator error logs now omit exception messages/stacks at `0b47ec5`; external provider log redaction and staging grants/restore review remain open.
- [ ] Owner and qualified advisers approve the data export, retention and deletion policy; implement and test the approved scope (see `DATA_LIFECYCLE_POLICY_DECISIONS.md`).
- [ ] Staging build, rollback and monitoring exercised. Record demo environment and known limitations.
- [ ] Any enabled tax logic has qualified review. AI drafts require explicit confirmation through the normal posting boundary.
- [ ] Owner accepts demo and limitations and explicitly approves any merge or production deployment.
- [ ] Production `WEB_ORIGIN` is explicitly configured with HTTPS origins and startup validation has been exercised in staging.
