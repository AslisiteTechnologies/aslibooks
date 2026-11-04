const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type AuthUser = { id: string; name: string; email: string };
type SessionResponse = { user: AuthUser } | null;
export type Organization = { id: string; name: string; slug: string; gstin: string; fiscalYearStartMonth: number; baseCurrency: string; role: string };
export const accountTypes = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
export type AccountInput = { name: string; code: string; type: typeof accountTypes[number] };
export type Account = AccountInput & { id: string; active: boolean; system: boolean };
const accountsPath = (org: string) => `/api/organizations/${org}/accounts`;
const contactsPath = (org: string) => `/api/organizations/${org}/contacts`;
export type ContactInput = { displayName: string; roles: Array<'customer' | 'vendor'>; email?: string; phone?: string; gstin?: string; address?: string };
export type Contact = ContactInput & { _id: string; active: boolean };
export type Product = { _id: string; code: string; name: string; description?: string; unitPricePaise: number; active: boolean };
export type Invoice = { id: string; customerName: string; status: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'partially_credited' | 'credited'; totalPaise: number; amountPaidPaise: number; amountCreditedPaise?: number; invoiceNumber?: string; dueDate?: string; overdue?: boolean; issuedAt?: string; createdAt: string };
export type InvoiceDocument = Invoice & { lines: Array<{ name: string; quantity: number; unitPricePaise: number; lineTotalPaise: number }> };
export type Receipt = { id: string; customerName: string; amountPaise: number; receivedAt: string; journalId: string; allocations: Array<{ invoiceId: string; invoiceNumber: string; amountPaise: number }> };
export type Bill = { id: string; vendorName: string; vendorReference: string; expenseAccountName: string; description: string; status: 'draft' | 'posted' | 'partially_paid' | 'paid' | 'partially_credited' | 'credited'; amountPaise: number; amountPaidPaise: number; amountCreditedPaise?: number; dueDate?: string; overdue?: boolean; journalId?: string };
export type VendorPayment = { id: string; vendorName: string; amountPaise: number; paidAt: string; journalId: string; allocations: Array<{ billId: string; vendorReference: string; amountPaise: number }> };
export type OpeningBalance = { id: string; asOf: string; totalPaise: number; journalId: string; lines: Array<{ accountId: string; accountCode: string; accountName: string; side: 'debit' | 'credit'; amountPaise: number }> };
export type Journal = { id: string; description: string; postedAt: string; reversalOf: string | null; lineCount: number };
export type JournalDetail = Omit<Journal, 'lineCount'> & { lines: Array<{ accountId: string; debitPaise: number; creditPaise: number }> };
export type JournalInput = { idempotencyKey: string; description: string; lines: Array<{ accountId: string; debitPaise: number; creditPaise: number }> };
export type TrialBalanceRow = { accountId: string; code: string; name: string; type: string; debitBalancePaise: number; creditBalancePaise: number };
export type GeneralLedgerResult = {
  account: { id: string; code: string; name: string; type: string; normalSide: 'debit' | 'credit' };
  from: string; to: string; openingBalancePaise: number;
  entries: Array<{ journalId: string; description: string; postedAt: string; debitPaise: number; creditPaise: number; runningBalancePaise: number }>;
  next: string | null;
};
export type ProfitAndLossResult = {
  from: string; to: string; accounts: Array<{ accountId: string; code: string; name: string; type: string; balancePaise: number }>;
  totalIncomePaise: number; totalExpensesPaise: number; netProfitPaise: number;
};
export type BalanceSheetResult = {
  asOf: string; accounts: Array<{ accountId: string; code: string; name: string; type: string; balancePaise: number }>;
  totalAssetsPaise: number; totalLiabilitiesPaise: number; totalEquityPaise: number;
  currentEarningsPaise: number; liabilitiesAndEquityPaise: number; balanced: boolean;
};
export type AgingSummary = { asOf: string; totalOutstandingPaise: number; documentCount: number; buckets: Record<'notDue' | 'current' | 'days1To30' | 'days31To60' | 'days61To90' | 'over90' | 'undated', { amountPaise: number; documentCount: number }> };
export type ControlReconciliation = { asOf: string; receivables: { accountName: string; ledgerBalancePaise: number; documentBalancePaise: number; differencePaise: number; reconciled: boolean }; payables: { accountName: string; ledgerBalancePaise: number; documentBalancePaise: number; differencePaise: number; reconciled: boolean } };

async function jsonRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body as { message?: string; error?: string } | null;
    throw new Error(error?.message || error?.error || 'Request failed');
  }
  return body as T;
}

export const api = {
  contacts: (org: string, q = '') => jsonRequest<{ contacts: Contact[]; next: string | null }>(
    contactsPath(org) + (q ? `?q=${encodeURIComponent(q)}` : ''),
  ),
  createContact: (org: string, input: ContactInput) =>
    jsonRequest<{ id: string }>(contactsPath(org), { method: 'POST', body: JSON.stringify(input) }),
  updateContact: (org: string, id: string, input: Partial<ContactInput> | { active: false }) =>
    jsonRequest<{ id: string }>(`${contactsPath(org)}/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  products: (org: string, q = '') => jsonRequest<{ products: Product[]; next: string | null }>(
    `/api/organizations/${org}/products` + (q ? `?q=${encodeURIComponent(q)}` : ''),
  ),
  createProduct: (org: string, input: { code: string; name: string; unitPricePaise: number }) =>
    jsonRequest<{ id: string }>(`/api/organizations/${org}/products`, { method: 'POST', body: JSON.stringify(input) }),
  invoices: (org: string) => jsonRequest<{ invoices: Invoice[]; next: string | null }>(`/api/organizations/${org}/invoices`),
  invoice: (org: string, id: string) => jsonRequest<{ invoice: InvoiceDocument }>(`/api/organizations/${org}/invoices/${id}`),
  createInvoiceDraft: (org: string, input: { customerId: string; lines: Array<{ productId: string; quantity: number }>; dueDate?: string }) =>
    jsonRequest<{ id: string; status: 'draft' }>(`/api/organizations/${org}/invoices`, { method: 'POST', body: JSON.stringify(input) }),
  issueInvoice: (org: string, id: string, idempotencyKey: string) =>
    jsonRequest<{ id: string; invoiceNumber: string; journalId: string; replayed: boolean; status: 'issued' | 'partially_paid' | 'paid' | 'partially_credited' | 'credited' }>(
      `/api/organizations/${org}/invoices/${id}/issue`, { method: 'POST', body: JSON.stringify({ idempotencyKey }) },
    ),
  issueCreditNote: (org: string, id: string, input: { idempotencyKey: string; amountPaise: number; reason: string }) =>
    jsonRequest<{ id: string; journalId: string; replayed: boolean }>(`/api/organizations/${org}/invoices/${id}/credit-notes`, { method: 'POST', body: JSON.stringify(input) }),
  receipts: (org: string) => jsonRequest<{ receipts: Receipt[] }>(`/api/organizations/${org}/receipts`),
  recordReceipt: (org: string, input: { idempotencyKey: string; cashAccountId: string; allocations: Array<{ invoiceId: string; amountPaise: number }> }) =>
    jsonRequest<{ id: string; journalId: string; amountPaise: number; replayed: boolean }>(
      `/api/organizations/${org}/receipts`, { method: 'POST', body: JSON.stringify(input) },
    ),
  bills: (org: string) => jsonRequest<{ bills: Bill[] }>(`/api/organizations/${org}/bills`),
  createBillDraft: (org: string, input: { vendorId: string; vendorReference: string; expenseAccountId: string; description: string; amountPaise: number; dueDate?: string }) =>
    jsonRequest<{ id: string; status: 'draft' }>(`/api/organizations/${org}/bills`, { method: 'POST', body: JSON.stringify(input) }),
  postBill: (org: string, id: string, idempotencyKey: string) => jsonRequest<{ id: string; journalId: string; replayed: boolean }>(
    `/api/organizations/${org}/bills/${id}/post`, { method: 'POST', body: JSON.stringify({ idempotencyKey }) },
  ),
  issueVendorCredit: (org: string, id: string, input: { idempotencyKey: string; amountPaise: number; reason: string }) =>
    jsonRequest<{ id: string; journalId: string; replayed: boolean }>(`/api/organizations/${org}/bills/${id}/credit-notes`, { method: 'POST', body: JSON.stringify(input) }),
  vendorPayments: (org: string) => jsonRequest<{ payments: VendorPayment[] }>(`/api/organizations/${org}/vendor-payments`),
  recordVendorPayment: (org: string, input: { idempotencyKey: string; cashAccountId: string; allocations: Array<{ billId: string; amountPaise: number }> }) =>
    jsonRequest<{ id: string; journalId: string; amountPaise: number; replayed: boolean }>(`/api/organizations/${org}/vendor-payments`, { method: 'POST', body: JSON.stringify(input) }),
  openingBalance: (org: string) => jsonRequest<{ opening: OpeningBalance | null }>(`/api/organizations/${org}/opening-balances`),
  postOpeningBalance: (org: string, input: { idempotencyKey: string; asOf: string; balances: Array<{ accountId: string; amountPaise: number }> }) =>
    jsonRequest<{ id: string; journalId: string; totalPaise: number; replayed: boolean }>(`/api/organizations/${org}/opening-balances`, { method: 'POST', body: JSON.stringify(input) }),
  updateOrganizationSettings: (org: string, input: { name?: string; gstin?: string; fiscalYearStartMonth?: number }) =>
    jsonRequest<{ settings: { id: string; name: string; gstin: string; fiscalYearStartMonth: number; baseCurrency: string } }>(`/api/organizations/${org}/settings`, { method: 'PATCH', body: JSON.stringify(input) }),
  accounts: (org: string, after = '') => jsonRequest<{ accounts: Account[]; next: string | null }>(
    accountsPath(org) + (after ? `?after=${encodeURIComponent(after)}` : ''),
  ),
  createAccount: (org: string, input: AccountInput) => jsonRequest<{ id: string }>(accountsPath(org), {
    method: 'POST', body: JSON.stringify(input),
  }),
  addStarterChart: (org: string) => jsonRequest<{ added: number; alreadyPresent: number; total: number }>(
    `${accountsPath(org)}/starter-chart`, { method: 'POST', body: '{}' },
  ),
  updateAccount: (org: string, id: string, input: { name: string } | { active: false }) =>
    jsonRequest<{ id: string }>(`${accountsPath(org)}/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  journals: (org: string, after = '') => jsonRequest<{ journals: Journal[]; next: string | null }>(
    `/api/organizations/${org}/journals` + (after ? `?after=${encodeURIComponent(after)}` : ''),
  ),
  journal: (org: string, id: string) => jsonRequest<{ journal: JournalDetail }>(`/api/organizations/${org}/journals/${id}`),
  postJournal: (org: string, input: JournalInput) => jsonRequest<{ journalId: string; replayed: boolean }>(
    `/api/organizations/${org}/journals`, { method: 'POST', body: JSON.stringify(input) },
  ),
  reverseJournal: (org: string, id: string, input: { idempotencyKey: string; reason: string }) =>
    jsonRequest<{ journalId: string; replayed: boolean }>(`/api/organizations/${org}/journals/${id}/reversals`, {
      method: 'POST', body: JSON.stringify(input),
    }),
  trialBalance: (org: string, asOf: string) => jsonRequest<{
    asOf: string; accounts: TrialBalanceRow[]; debitTotalPaise: number; creditTotalPaise: number; balanced: boolean;
  }>(`/api/organizations/${org}/reports/trial-balance?asOf=${encodeURIComponent(asOf)}`),
  profitAndLoss: (org: string, to: string) => jsonRequest<ProfitAndLossResult>(
    `/api/organizations/${org}/reports/profit-and-loss?to=${encodeURIComponent(to)}`,
  ),
  balanceSheet: (org: string, asOf: string) => jsonRequest<BalanceSheetResult>(
    `/api/organizations/${org}/reports/balance-sheet?asOf=${encodeURIComponent(asOf)}`,
  ),
  agedReceivables: (org: string, asOf: string) => jsonRequest<AgingSummary>(`/api/organizations/${org}/reports/aged-receivables?asOf=${encodeURIComponent(asOf)}`),
  agedPayables: (org: string, asOf: string) => jsonRequest<AgingSummary>(`/api/organizations/${org}/reports/aged-payables?asOf=${encodeURIComponent(asOf)}`),
  controlAccountReconciliation: (org: string) => jsonRequest<ControlReconciliation>(`/api/organizations/${org}/reports/control-account-reconciliation`),
  generalLedger: (org: string, accountId: string, from: string, to: string, after = '') => {
    const query = new URLSearchParams({ accountId, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(after ? { after } : {}) });
    return jsonRequest<GeneralLedgerResult>(`/api/organizations/${org}/reports/general-ledger?${query}`);
  },
  session: () => jsonRequest<SessionResponse>('/api/auth/get-session'),
  signIn: (email: string, password: string) => jsonRequest<unknown>('/api/auth/sign-in/email', {
    method: 'POST', body: JSON.stringify({ email, password }),
  }),
  signUp: (name: string, email: string, password: string) => jsonRequest<unknown>('/api/auth/sign-up/email', {
    method: 'POST', body: JSON.stringify({ name, email, password }),
  }),
  signOut: () => jsonRequest<unknown>('/api/auth/sign-out', { method: 'POST', body: '{}' }),
  organizations: async () => (await jsonRequest<{ organizations: Organization[] }>('/api/organizations')).organizations,
  createOrganization: (name: string, slug: string) => jsonRequest<{ id: string }>('/api/organizations', {
    method: 'POST', body: JSON.stringify({ name, slug }),
  }),
};
