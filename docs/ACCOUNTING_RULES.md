# Accounting rules

All supported ledger entries are INR. The posting service expects 2–200 lines. Every amount and each running total must be a safe integer in paise. Each line has one positive side and one zero side. Total debits equal total credits. Account IDs must resolve to active accounts in the posting organization.

| Event | Debit | Credit | Example in paise |
| --- | --- | --- | --- |
| Manual cash sale without tax | Cash (asset) | Sales (income) | 12,500 each |
| Credit sale without tax | Receivables (asset) | Sales (income) | 10,000 each |
| Partial receipt | Bank (asset) | Receivables (asset) | 4,000 each, leaving 6,000 due |
| Expense on credit | Expense | Payables (liability) | 7,500 each |
| Bill settlement | Payables (liability) | Bank (asset) | 7,500 each |

Document and settlement rows are acceptance fixtures for future document services. Equity is the fifth supported account type. Do not infer a tax rate. Quantity scaling, discount order and tax rounding need explicit rules and tests before enabling those calculations.

A correction creates a new journal with swapped debits and credits. The original survives. A tenant-scoped unique partial index limits each original to one reversal. Tenant-scoped idempotency keys protect retries. The journal and audit event commit together.

Posting time currently comes from the server. Financial-year selection, accounting dates and period locks remain release gates. Reports must use posted ledger movements, include reversals on the appropriate date, and reconcile debits to credits, profit to equity and assets to liabilities plus equity. Aging also requires immutable document/allocation links.
