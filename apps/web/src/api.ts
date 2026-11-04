const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type AuthUser = { id: string; name: string; email: string };
type SessionResponse = { user: AuthUser } | null;
export type Organization = { id: string; name: string; slug: string; baseCurrency: string; role: string };
export const accountTypes = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
export type AccountInput = { name: string; code: string; type: typeof accountTypes[number] };
export type Account = AccountInput & { id: string; active: boolean; system: boolean };
const accountsPath = (org: string) => `/api/organizations/${org}/accounts`;
const contactsPath = (org: string) => `/api/organizations/${org}/contacts`;
export type ContactInput = { displayName: string; roles: Array<'customer' | 'vendor'>; email?: string; phone?: string; gstin?: string; address?: string };
export type Contact = ContactInput & { _id: string; active: boolean };
export type Product = { _id: string; code: string; name: string; description?: string; unitPricePaise: number; active: boolean };
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
  accounts: (org: string, after = '') => jsonRequest<{ accounts: Account[]; next: string | null }>(
    accountsPath(org) + (after ? `?after=${encodeURIComponent(after)}` : ''),
  ),
  createAccount: (org: string, input: AccountInput) => jsonRequest<{ id: string }>(accountsPath(org), {
    method: 'POST', body: JSON.stringify(input),
  }),
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
