import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { accountTypes, api, type Account, type AccountInput, type Organization } from './api';

const empty: AccountInput = { code: '', name: '', type: 'asset' };

export function AccountsScreen({ organization }: { organization: Organization }) {
  const [rows, setRows] = useState<Account[]>([]);
  const [pages, setPages] = useState(['']);
  const [next, setNext] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<AccountInput>(empty);
  const [editing, setEditing] = useState('');
  const canWrite = ['owner', 'admin', 'accountant'].includes(organization.role);
  const cursor = pages[pages.length - 1];

  useEffect(() => {
    let current = true;
    setLoading(true); setError(''); setRows([]); setNext(null);
    api.accounts(organization.id, cursor).then(page => {
      if (current) { setRows(page.accounts); setNext(page.next); }
    }).catch(() => { if (current) setError('Unable to load this chart of accounts.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [organization.id, cursor, revision]);

  async function save(event: FormEvent) {
    event.preventDefault();
    await change(() => editing ? api.updateAccount(organization.id, editing, { name: draft.name })
      : api.createAccount(organization.id, draft), editing ? 'Account renamed.' : 'Account created.');
  }
  async function change(write: () => Promise<unknown>, success: string) {
    setSaving(true); setError(''); setNotice('');
    try {
      await write(); setNotice(success); setDraft(empty); setEditing(''); setRevision(n => n + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Account change failed.'); }
    finally { setSaving(false); }
  }
  return <Stack spacing={2}>
    <Typography variant="h5">Chart of accounts</Typography>
    {canWrite && <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack component="form" onSubmit={save} spacing={2}>
        <Typography variant="h6">{editing ? 'Rename account' : 'New account'}</Typography>
        <TextField required label="Account code" disabled={!!editing || saving} value={draft.code}
          inputProps={{ maxLength: 32 }} helperText="Letters, numbers, hyphens and underscores"
          onChange={e => setDraft({ ...draft, code: e.target.value })} />
        <TextField required label="Account name" disabled={saving} value={draft.name} inputProps={{ maxLength: 160 }}
          onChange={e => setDraft({ ...draft, name: e.target.value })} />
        <TextField select label="Account type" disabled={!!editing || saving} value={draft.type}
          onChange={e => setDraft({ ...draft, type: e.target.value as AccountInput['type'] })}>
          {accountTypes.map(type => <MenuItem key={type} value={type}>{type}</MenuItem>)}
        </TextField>
        <Stack direction="row" spacing={1}>
          <Button type="submit" variant="contained" disabled={saving}>{editing ? 'Save name' : 'Create account'}</Button>
          {editing && <Button disabled={saving} onClick={() => { setDraft(empty); setEditing(''); }}>Cancel</Button>}
        </Stack>
      </Stack>
    </Paper>}
    {error && <Alert severity="error" action={<Button onClick={() => setRevision(n => n + 1)}>Reload</Button>}>{error}</Alert>}
    {notice && <Typography role="status">{notice}</Typography>}
    {loading ? <Typography role="status">Loading accounts…</Typography>
      : !error && !rows.length && <Typography>No accounts on this page.</Typography>}
    {rows.map(a => <Paper variant="outlined" key={a.id} sx={{ p: 2 }}>
      <Typography variant="h6">{a.code} · {a.name}</Typography>
      <Typography>{a.type} · {a.active ? 'Active' : 'Archived'}{a.system && ' · System account'}</Typography>
      {canWrite && a.active && !a.system && <Stack direction="row">
        <Button disabled={saving} onClick={() => { setDraft(a); setEditing(a.id); }}>Rename</Button>
        <Button disabled={saving} onClick={() => { void change(() => api.updateAccount(organization.id, a.id, { active: false }), 'Account archived.'); }}>Archive</Button>
      </Stack>}
    </Paper>)}
    <Stack direction="row" spacing={1}>
      {pages.length > 1 && <Button disabled={loading} onClick={() => setPages(p => p.slice(0, -1))}>Previous accounts</Button>}
      {next && <Button disabled={loading} onClick={() => setPages(p => [...p, next])}>Next accounts</Button>}
    </Stack>
  </Stack>;
}
