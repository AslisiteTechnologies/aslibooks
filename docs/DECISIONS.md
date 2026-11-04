# Engineering decisions

- Preserve the existing pnpm/Turborepo, TypeScript, React/MUI, Express, Better Auth, MongoDB/Mongoose stack.
- Store INR money as safe integer paise. Prohibit tax treatment until deterministic assumptions and review exist.
- Derive actor IDs from Better Auth session. Tenant access uses active membership. Ledger posting and membership fencing occur within MongoDB transactions.
- Journal entries are append-only through application middleware and are corrected with linked reversals. Database administrators and raw collection access can bypass Mongoose guards. Production database role design remains open.
- Use organization-scoped cursor pagination and strict Zod route schemas. Role accounting follows existing permission policy.
- Track first ledger use on accounts transactionally. Archive and first posting serialize on the same account records. Existing journal references also guard legacy rows without the new usage flag.
- Default fiscal year should be Apr–Mar, but localizing year selection, date cutoffs and period closure requires a tested fiscal calendar implementation before posting dates ship.
- Invoice recognition, GST rates and inclusive/exclusive rounding require qualified accounting review. Until then, hold invoices at draft and keep unsupported tax/posting options disabled.
- Production access, subscription purchase, production deployment and merge to main remain owner-controlled.
