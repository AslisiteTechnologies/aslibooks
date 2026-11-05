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
export type ContactLedger = { contact: { id: string; displayName: string }; currency: 'INR'; rows: Array<{ eventId: string; date: string; type: string; reference: string; description: string; debitPaise: number; creditPaise: number; balancePaise: number }>; balancePaise: number; openingBalancePaise: number; next: string | null; subledger?: { openDocumentBalancePaise: number; unallocatedAdvancePaise: number; netBalancePaise: number; differencePaise: number; reconciled: boolean } };
export type TaxCategory = 'not_configured' | 'taxable' | 'exempt' | 'nil_rated' | 'non_gst';
export type Product = { _id: string; code: string; name: string; description?: string; unit: string; unitPricePaise: number; hsnSacCode?: string; taxCategory: TaxCategory; gstRateBasisPoints?: number; active: boolean };
export type Invoice = { id: string; customerId: string; customerName: string; status: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'partially_credited' | 'credited'; totalPaise: number; amountPaidPaise: number; amountCreditedPaise?: number; taxTreatment?: 'none' | 'exclusive' | 'inclusive'; taxableSubtotalPaise?: number; cgstPaise?: number; sgstPaise?: number; igstPaise?: number; totalTaxPaise?: number; gstReviewRequired?: boolean; invoiceNumber?: string; dueDate?: string; overdue?: boolean; issuedAt?: string; createdAt: string };
export type InvoiceDocument = Invoice & { lines: Array<{ name: string; unit: string; quantity: number; unitPricePaise: number; lineTotalPaise: number; hsnSacCode?: string; taxCategory?: TaxCategory; gstRateBasisPoints?: number; taxablePaise?: number; cgstPaise?: number; sgstPaise?: number; igstPaise?: number }> };
export type Receipt = { id: string; customerName: string; amountPaise: number; receivedAt: string; journalId: string; allocations: Array<{ invoiceId: string; invoiceNumber: string; amountPaise: number }> };
export type CustomerAdvance = { id: string; customerId: string; customerName: string; amountPaise: number; allocatedPaise: number; refundedPaise: number; availablePaise: number; receivedAt: string; journalId: string };
export type Attachment = { id: string; resourceType: 'invoice' | 'bill' | 'journal'; resourceId: string; filename: string; contentType: string; sizeBytes: number; sha256: string; createdAt: string };
export type Bill = { id: string; vendorId: string; vendorName: string; vendorReference: string; expenseAccountName: string; description: string; status: 'draft' | 'posted' | 'partially_paid' | 'paid' | 'partially_credited' | 'credited'; amountPaise: number; amountPaidPaise: number; amountCreditedPaise?: number; dueDate?: string; overdue?: boolean; journalId?: string };
export type VendorPayment = { id: string; vendorName: string; amountPaise: number; paidAt: string; journalId: string; allocations: Array<{ billId: string; vendorReference: string; amountPaise: number }> };
export type VendorAdvance = { id: string; vendorId: string; vendorName: string; amountPaise: number; allocatedPaise: number; availablePaise: number; paidAt: string; journalId: string };
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
export type BankTransaction = { id: string; transactionDate: string; amountPaise: number; description: string; status: 'unmatched' | 'matched' | 'reconciled'; journalId: string | null };
export type BankReconciliation = { id: string; periodStart: string; periodEnd: string; openingBalancePaise: number; closingBalancePaise: number; ledgerBalancePaise: number; transactionCount: number };
export type CashTransfer = { id: string; fromAccountId: string; fromAccountName: string; toAccountId: string; toAccountName: string; amountPaise: number; transferredAt: string; journalId: string };
export type DashboardResult = { from: string; to: string; revenuePaise: number; expensesPaise: number; netProfitPaise: number; cashPaise: number; receivablesPaise: number; payablesPaise: number; recentActivity: Array<{ id: string; description: string; postedAt: string; lineCount: number }> };
export type FinancialExplanation = { summary: string; observations: string[]; questions: string[] };
export type OrganizationMember = { id: string; name: string; email: string; role: string; status: 'active' | 'invited' | 'suspended'; isSelf: boolean };
export type OrganizationInvitation = { id: string; organizationId: string; organizationName: string; organizationSlug: string; role: string };
export type FiscalPeriod = { id: string; startDate: string; endDateExclusive: string; status: 'open' | 'closed'; closedAt?: string };
export type FiscalCloseChecklist = { periodId: string; startDate: string; endDateExclusive: string; status: 'open' | 'closed'; canClose: boolean; checks: Array<{ id: string; label: string; passed: boolean; blocking: boolean; detail: string; count?: number }> };

async function jsonRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path.startsWith('/api/organizations')) {
      window.dispatchEvent(new Event('aslibooks:session-expired'));
    }
    const error = body as { message?: string; error?: string } | null;
    throw new Error(error?.message || error?.error || 'Request failed');
  }
  return body as T;
}

export const api = {
  contacts: (org: string, q = '', after = '') => jsonRequest<{ contacts: Contact[]; next: string | null }>(
    contactsPath(org) + `?${new URLSearchParams({ ...(q ? { q } : {}), ...(after ? { after } : {}) })}`,
  ),
  contactLedger: (org: string, id: string, role: 'customer' | 'vendor', after = '') =>
    jsonRequest<ContactLedger>(`${contactsPath(org)}/${id}/ledger?${new URLSearchParams({ role, limit: '50', ...(after ? { after } : {}) })}`),
  createContact: (org: string, input: ContactInput) =>
    jsonRequest<{ id: string }>(contactsPath(org), { method: 'POST', body: JSON.stringify(input) }),
  updateContact: (org: string, id: string, input: Partial<ContactInput> | { active: false }) =>
    jsonRequest<{ id: string }>(`${contactsPath(org)}/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  products: (org: string, q = '', after = '') => jsonRequest<{ products: Product[]; next: string | null }>(
    `/api/organizations/${org}/products` + `?${new URLSearchParams({ ...(q ? { q } : {}), ...(after ? { after } : {}) })}`,
  ),
  createProduct: (org: string, input: { code: string; name: string; unit?: string; unitPricePaise: number; hsnSacCode?: string; taxCategory?: TaxCategory; gstRateBasisPoints?: number }) =>
    jsonRequest<{ id: string }>(`/api/organizations/${org}/products`, { method: 'POST', body: JSON.stringify(input) }),
  updateProduct: (org: string, id: string, input: { name?: string; unit?: string; unitPricePaise?: number; hsnSacCode?: string; taxCategory?: TaxCategory; gstRateBasisPoints?: number } | { active: false }) =>
    jsonRequest<{ id: string }>(`/api/organizations/${org}/products/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  invoices: (org: string) => jsonRequest<{ invoices: Invoice[]; next: string | null }>(`/api/organizations/${org}/invoices`),
  invoice: (org: string, id: string) => jsonRequest<{ invoice: InvoiceDocument }>(`/api/organizations/${org}/invoices/${id}`),
  createInvoiceDraft: (org: string, input: { idempotencyKey: string; customerId: string; lines: Array<{ productId: string; quantity: number }>; dueDate?: string; taxTreatment?: { kind: 'none' | 'exclusive' | 'inclusive'; placeOfSupplyStateCode?: string; supplyKind?: 'intra_state' | 'inter_state' } }) =>
    jsonRequest<{ id: string; status: Invoice['status']; replayed: boolean }>(`/api/organizations/${org}/invoices`, { method: 'POST', body: JSON.stringify(input) }),
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
  customerAdvances: (org: string) => jsonRequest<{ advances: CustomerAdvance[] }>(`/api/organizations/${org}/customer-advances`),
  recordCustomerAdvance: (org: string, input: { idempotencyKey: string; customerId: string; cashAccountId: string; amountPaise: number }) =>
    jsonRequest<{ id: string; journalId: string; replayed: boolean }>(`/api/organizations/${org}/customer-advances`, { method: 'POST', body: JSON.stringify(input) }),
  allocateCustomerAdvance: (org: string, advanceId: string, input: { idempotencyKey: string; invoiceId: string; amountPaise: number }) =>
    jsonRequest<{ id: string; journalId: string; replayed: boolean }>(`/api/organizations/${org}/customer-advances/${advanceId}/allocations`, { method: 'POST', body: JSON.stringify(input) }),
  refundCustomerAdvance: (org: string, advanceId: string, input: { idempotencyKey: string; cashAccountId: string; amountPaise: number }) =>
    jsonRequest<{ id: string; journalId: string; replayed: boolean }>(`/api/organizations/${org}/customer-advances/${advanceId}/refunds`, { method: 'POST', body: JSON.stringify(input) }),
  attachments: (org: string, resourceType: Attachment['resourceType'], resourceId: string) =>
    jsonRequest<{ attachments: Attachment[] }>(`/api/organizations/${org}/attachments?${new URLSearchParams({ resourceType, resourceId })}`),
  uploadAttachment: async (org: string, resourceType: Attachment['resourceType'], resourceId: string, file: File, idempotencyKey: string): Promise<Attachment> => {
    const response = await fetch(`${API_URL}/api/organizations/${org}/attachments`, {
      method: 'POST', credentials: 'include', body: file,
      headers: { 'Content-Type': file.type, 'x-resource-type': resourceType, 'x-resource-id': resourceId, 'x-file-name': encodeURIComponent(file.name), 'idempotency-key': idempotencyKey },
    });
    const body = await response.json().catch(() => null) as (Attachment & { error?: string; replayed?: boolean }) | null;
    if (!response.ok) throw new Error(body?.error || 'Attachment could not be uploaded');
    return body as Attachment;
  },
  downloadAttachment: (org: string, attachmentId: string) => fetch(`${API_URL}/api/organizations/${org}/attachments/${attachmentId}/content`, { credentials: 'include' }).then(async response => {
    if (!response.ok) { const body = await response.json().catch(() => null) as { error?: string } | null; throw new Error(body?.error || 'Attachment could not be downloaded'); }
    return response.blob();
  }),
  bills: (org: string) => jsonRequest<{ bills: Bill[] }>(`/api/organizations/${org}/bills`),
  createBillDraft: (org: string, input: { idempotencyKey: string; vendorId: string; vendorReference: string; expenseAccountId: string; description: string; amountPaise: number; dueDate?: string }) =>
    jsonRequest<{ id: string; status: 'draft' }>(`/api/organizations/${org}/bills`, { method: 'POST', body: JSON.stringify(input) }),
  extractBillDraft: (org: string, sourceText: string) => jsonRequest<{ vendorName: string | null; vendorReference: string | null; description: string | null; amountPaise: number | null; dueDate: string | null; currency: 'INR' | 'other' | 'unknown'; taxStatus: 'none_seen' | 'present' | 'unclear'; confidence: 'high' | 'medium' | 'low'; uncertainties: string[] }>(`/api/organizations/${org}/bills/ai-draft-assistance`, { method: 'POST', body: JSON.stringify({ sourceText }) }),
  postBill: (org: string, id: string, idempotencyKey: string) => jsonRequest<{ id: string; journalId: string; replayed: boolean }>(
    `/api/organizations/${org}/bills/${id}/post`, { method: 'POST', body: JSON.stringify({ idempotencyKey }) },
  ),
  issueVendorCredit: (org: string, id: string, input: { idempotencyKey: string; amountPaise: number; reason: string }) =>
    jsonRequest<{ id: string; journalId: string; replayed: boolean }>(`/api/organizations/${org}/bills/${id}/credit-notes`, { method: 'POST', body: JSON.stringify(input) }),
  vendorPayments: (org: string) => jsonRequest<{ payments: VendorPayment[] }>(`/api/organizations/${org}/vendor-payments`),
  recordVendorPayment: (org: string, input: { idempotencyKey: string; cashAccountId: string; allocations: Array<{ billId: string; amountPaise: number }> }) =>
    jsonRequest<{ id: string; journalId: string; amountPaise: number; replayed: boolean }>(`/api/organizations/${org}/vendor-payments`, { method: 'POST', body: JSON.stringify(input) }),
  vendorAdvances: (org: string) => jsonRequest<{ advances: VendorAdvance[] }>(`/api/organizations/${org}/vendor-advances`),
  recordVendorAdvance: (org: string, input: { idempotencyKey: string; vendorId: string; cashAccountId: string; amountPaise: number }) =>
    jsonRequest<{ id: string; journalId: string; replayed: boolean }>(`/api/organizations/${org}/vendor-advances`, { method: 'POST', body: JSON.stringify(input) }),
  allocateVendorAdvance: (org: string, advanceId: string, input: { idempotencyKey: string; billId: string; amountPaise: number }) =>
    jsonRequest<{ id: string; journalId: string; replayed: boolean }>(`/api/organizations/${org}/vendor-advances/${advanceId}/allocations`, { method: 'POST', body: JSON.stringify(input) }),
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
  bankStatement: (org: string, accountId: string) => jsonRequest<{ transactions: BankTransaction[]; next: string | null; reconciliations: BankReconciliation[] }>(`/api/organizations/${org}/bank-statements?accountId=${encodeURIComponent(accountId)}`),
  importBankStatement: (org: string, accountId: string, transactions: Array<{ transactionDate: string; amountPaise: number; description: string }>) => jsonRequest<{ imported: number; duplicates: number }>(`/api/organizations/${org}/bank-statements/import`, { method: 'POST', body: JSON.stringify({ accountId, transactions }) }),
  matchBankTransaction: (org: string, transactionId: string, journalId: string) => jsonRequest<{ matched: true }>(`/api/organizations/${org}/bank-statements/${transactionId}/match`, { method: 'POST', body: JSON.stringify({ journalId }) }),
  reconcileBankStatement: (org: string, input: { accountId: string; periodStart: string; periodEnd: string; openingBalancePaise: number; closingBalancePaise: number }) => jsonRequest<{ id: string; replayed: boolean; transactionCount: number }>(`/api/organizations/${org}/bank-statements/reconcile`, { method: 'POST', body: JSON.stringify(input) }),
  transfers: (org: string) => jsonRequest<{ transfers: CashTransfer[] }>(`/api/organizations/${org}/transfers`),
  createTransfer: (org: string, input: { idempotencyKey: string; fromAccountId: string; toAccountId: string; amountPaise: number }) => jsonRequest<{ id: string; journalId: string; replayed: boolean }>(`/api/organizations/${org}/transfers`, { method: 'POST', body: JSON.stringify(input) }),
  dashboard: (org: string, from: string, to: string) => jsonRequest<DashboardResult>(`/api/organizations/${org}/reports/dashboard?${new URLSearchParams({ from, to })}`),
  explainFinancialSummary: (org: string, input: { period: string; currency: 'INR'; revenuePaise: number; expensesPaise: number; netProfitPaise: number; cashPaise: number; receivablesPaise: number; payablesPaise: number }) =>
    jsonRequest<FinancialExplanation>(`/api/organizations/${org}/reports/ai-explanation`, { method: 'POST', body: JSON.stringify(input) }),
  members: (org: string) => jsonRequest<{ members: OrganizationMember[] }>(`/api/organizations/${org}/members`),
  inviteMember: (org: string, email: string, role: 'admin' | 'accountant' | 'viewer') => jsonRequest<{ id: string; status: 'invited'; notificationSent: boolean }>(`/api/organizations/${org}/members`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  updateMember: (org: string, memberId: string, input: { role: string } | { status: 'active' | 'suspended' }) => jsonRequest<{ updated: true }>(`/api/organizations/${org}/members/${memberId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  invitations: () => jsonRequest<{ invitations: OrganizationInvitation[] }>('/api/organizations/invitations'),
  acceptInvitation: (org: string, invitationId: string) => jsonRequest<{ accepted: true; organizationId: string }>(`/api/organizations/${org}/invitations/${invitationId}/accept`, { method: 'POST', body: '{}' }),
  authConfig: () => jsonRequest<{ emailVerificationRequired: boolean }>('/api/public/config'),
  resendVerificationEmail: (email: string) => jsonRequest<unknown>('/api/auth/send-verification-email', { method: 'POST', body: JSON.stringify({ email, callbackURL: window.location.origin }) }),
  requestPasswordReset: (email: string) => jsonRequest<unknown>('/api/auth/request-password-reset', { method: 'POST', body: JSON.stringify({ email, redirectTo: window.location.origin }) }),
  resetPassword: (token: string, newPassword: string) => jsonRequest<unknown>('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),
  fiscalPeriods: (org: string) => jsonRequest<{ periods: FiscalPeriod[] }>(`/api/organizations/${org}/fiscal-periods`),
  fiscalCloseChecklist: (org: string, periodId: string) => jsonRequest<{ checklist: FiscalCloseChecklist }>(`/api/organizations/${org}/fiscal-periods/${periodId}/close-checklist`),
  closeFiscalPeriod: (org: string, periodId: string) => jsonRequest<{ status: 'closed'; checklist: FiscalCloseChecklist }>(`/api/organizations/${org}/fiscal-periods/${periodId}/close`, { method: 'POST', body: JSON.stringify({ confirmChecklist: true }) }),
  session: () => jsonRequest<SessionResponse>('/api/auth/get-session'),
  signIn: (email: string, password: string) => jsonRequest<unknown>('/api/auth/sign-in/email', {
    method: 'POST', body: JSON.stringify({ email, password }),
  }),
  signUp: (name: string, email: string, password: string) => jsonRequest<unknown>('/api/auth/sign-up/email', {
    method: 'POST', body: JSON.stringify({ name, email, password, callbackURL: window.location.origin }),
  }),
  signOut: () => jsonRequest<unknown>('/api/auth/sign-out', { method: 'POST', body: '{}' }),
  organizations: async () => (await jsonRequest<{ organizations: Organization[] }>('/api/organizations')).organizations,
  createOrganization: (name: string, slug: string) => jsonRequest<{ id: string }>('/api/organizations', {
    method: 'POST', body: JSON.stringify({ name, slug }),
  }),
};

