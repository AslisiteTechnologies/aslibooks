# MVP release checklist

For each gate attach the exact tested SHA, environment, run link and reviewer. [PROGRESS.md](PROGRESS.md) records verified revisions.

- [ ] CI and MongoDB integration succeed on release candidate (frozen install, typecheck, lint, unit, build, high-severity dependency audit, real replica-set tests).
- [ ] Browser completes sign-in, tenant selection, financial year, membership and role denial.
- [ ] Chart, contacts, sales, bills, receipts and vendor payments cover audit, tenancy, retries and concurrent changes.
- [ ] Manual journals, closed periods and reversals pass atomicity and immutability checks.
- [ ] Golden business month reconciles across GL, trial balance, P&L, balance sheet and aging.
- [ ] Browser completes onboarding → invoice → partial receipt → reports on desktop and mobile viewport.
- [ ] Automated WCAG 2.1 A/AA scans pass on key browser workflows; manual keyboard, screen-reader, focus, and contrast review is recorded.
- [ ] Security review covers session expiry, abuse controls, redaction, advisories, grants and restore rehearsal.
- [ ] Staging build, rollback and monitoring exercised. Record demo environment and known limitations.
- [ ] Any enabled tax logic has qualified review. AI drafts require explicit confirmation through the normal posting boundary.
- [ ] Owner accepts demo and limitations and explicitly approves any merge or production deployment.
- [ ] Production `WEB_ORIGIN` is explicitly configured with HTTPS origins and startup validation has been exercised in staging.
