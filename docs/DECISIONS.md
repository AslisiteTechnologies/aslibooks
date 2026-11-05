# Engineering decisions

- Preserve the existing pnpm/Turborepo, TypeScript, React/MUI, Express, Better Auth, MongoDB/Mongoose stack.
- Store INR money as safe integer paise. Prohibit tax treatment until deterministic assumptions and review exist.
- Derive actor IDs from Better Auth session. Tenant access uses active membership. Ledger posting and membership fencing occur within MongoDB transactions.
- Journal entries are append-only through application middleware and are corrected with linked reversals. Database administrators and raw collection access can bypass Mongoose guards. Production database role design remains open.
- Use organization-scoped cursor pagination and strict Zod route schemas. Role accounting follows existing permission policy.
- Track first ledger use on accounts transactionally. Archive and first posting serialize on the same account records. Existing journal references also guard legacy rows without the new usage flag.
- Default fiscal year should be Apr–Mar, but localizing year selection, date cutoffs and period closure requires a tested fiscal calendar implementation before posting dates ship.
- Invoice recognition policy is accrual: issuing a draft invoice posts nothing; explicitly issuing a tax-free invoice atomically posts debit receivables 1100 / credit sales income 4000. GST rates, inclusive/exclusive rounding, place of supply and filing treatment require qualified accounting review. Issuance remains limited to zero-tax service lines with no discounts or inventory tracking.
- Production access, subscription purchase, production deployment and merge to main remain owner-controlled.

- The optional Indian SME starter chart adds only missing organization account codes in one authorized transaction and never replaces custom rows. It omits contra-asset defaults because the current account type model cannot represent normal credit balances within assets safely. GST-named accounts are only labels; no tax behavior or compliance is implied.
- Sales invoices snapshot customer and service facts, quantities, and integer-paise prices. Issuance atomically debits `1100` receivables and credits `4000` sales income. Invoice numbers use the configured fiscal year. Corrections use linked credit notes or reversals; settlement and print views are implemented. GST, discounts, inventory and tax calculation remain unsupported.
- Customer receipts allocate to outstanding invoices for the same customer and debit starter cash/bank accounts `1000` or `1010` while crediting receivables `1100`. Partial/final receipts, vendor bills, partial/final vendor payments and linked credit notes are implemented transactionally. Advances, cash refunds and transfers remain unsupported.
- Invitations are bound to an existing Better Auth user with a verified email; only that user can accept. Role changes and suspension are audited and fenced. No invitation or email-verification delivery provider is configured. Do not remove the verified-email restriction as a workaround; configure and verify an email provider before presenting invitations as available to new accounts.

