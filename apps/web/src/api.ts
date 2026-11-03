const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type AuthUser = { id: string; name: string; email: string };
type SessionResponse = { user: AuthUser } | null;
export type Organization = { id: string; name: string; slug: string; baseCurrency: string };

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
