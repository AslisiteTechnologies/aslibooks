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

- The optional Indian SME starter chart adds only missing organization account codes in one authorized transaction and never replaces custom rows. It omits contra-asset defaults because the current account type model cannot represent normal credit balances within assets safely. GST-named accounts are only labels; no tax behavior or compliance is implied.
- Sales uses accrual recognition for this MVP slice: a draft has no ledger effect; issuance atomically debits code `1100` receivables and credits code `4000` sales income. Invoice totals are integer paise from snapshotted service prices and whole-unit quantities. Only zero-tax service invoices without discounts or inventory tracking may be issued; the UI states this limitation. A fiscal-year sequence creates `ASL/YYYY-YY/NNNNN` numbers. Corrections require journal reversal; credit notes, settlement and invoice PDF remain unimplemented.
- Customer receipts allocate the full receipt to one or more outstanding invoices for the same customer; allocation totals equal the posted receipt. Posting debits only the starter cash/bank accounts `1000` or `1010`, credits receivables `1100`, updates invoice paid amount/state, and creates immutable receipt, journal and audit records in one transaction. Partial/final allocation is supported; overpayments, advances, refunds and vendor payments are blocked until designed.
