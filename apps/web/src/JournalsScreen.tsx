import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, type Account, type Journal, type JournalDetail, type Organization } from './api';

type LineDraft = { accountId: string; side: 'debit' | 'credit'; amount: string };
const initialLines: LineDraft[] = [{ accountId: '', side: 'debit', amount: '' }, { accountId: '', side: 'credit', amount: '' }];
const parsePaise = (value: string): number | null => {
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(value)) return null;
  const [rupees, fraction = ''] = value.split('.');
  const paise = BigInt(rupees) * 100n + BigInt(fraction.padEnd(2, '0'));
  return paise > 0n && paise <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(paise) : null;
};
const formatPaise = (value: number) => `₹${Math.floor(value / 100).toLocaleString('en-IN')}.${String(value % 100).padStart(2, '0')}`;

export function JournalsScreen({ organization }: { organization: Organization }) {
  const canPost = ['owner', 'admin', 'accountant'].includes(organization.role);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<LineDraft[]>(initialLines);
  const [details, setDetails] = useState<Record<string, JournalDetail>>({});
  const [reverseId, setReverseId] = useState('');
  const [reverseReason, setReverseReason] = useState('');
  const [confirmPost, setConfirmPost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const totals = useMemo(() => lines.reduce((result, line) => {
    const value = parsePaise(line.amount) ?? 0;
    if (line.side === 'debit') result.debit += value; else result.credit += value;
    return result;
  }, { debit: 0, credit: 0 }), [lines]);

  useEffect(() => {
    let current = true;
    async function load() {
      setLoading(true); setError('');
      try {
        const [chart, page] = await Promise.all([api.accounts(organization.id), api.journals(organization.id)]);
        const allAccounts = [...chart.accounts];
        let cursor = chart.next;
        while (cursor) {
          const nextPage = await api.accounts(organization.id, cursor);
          allAccounts.push(...nextPage.accounts);
          cursor = nextPage.next;
        }
        if (current) {
          const active = allAccounts.filter(account => account.active);
          setAccounts(active);
          setJournals(page.journals);
          setNext(page.next);
          setLines(old => old.map((line, index) => ({ ...line, accountId: line.accountId || active[index % Math.max(1, active.length)]?.id || '' })));
        }
      } catch (cause) {
        if (current) setError(cause instanceof Error ? cause.message : 'Unable to load journals.');
      } finally { if (current) setLoading(false); }
    }
    void load();
    return () => { current = false; };
  }, [organization.id, revision]);

  function updateLine(index: number, update: Partial<LineDraft>) {
    setLines(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...update } : line));
  }

  async function post(event: FormEvent) {
    event.preventDefault();
    setError(''); setNotice('');
    if (!description.trim() || lines.length < 2) { setError('Add a description and at least two lines.'); return; }
    if (lines.some(line => !line.accountId || parsePaise(line.amount) === null)) {
      setError('Choose an active account and enter a positive amount with up to two decimal places on every line.'); return;
    }
    if (!Number.isSafeInteger(totals.debit) || !Number.isSafeInteger(totals.credit)) { setError('Journal totals exceed the supported amount.'); return; }
    if (totals.debit !== totals.credit) { setError('Debits and credits must balance before posting.'); return; }
    setConfirmPost(true);
  }

  async function confirmAndPost() {
    setBusy(true); setError('');
    try {
      const result = await api.postJournal(organization.id, {
        idempotencyKey: `manual:${crypto.randomUUID()}`,
        description: description.trim(),
        lines: lines.map(line => ({
          accountId: line.accountId,
          debitPaise: line.side === 'debit' ? parsePaise(line.amount)! : 0,
          creditPaise: line.side === 'credit' ? parsePaise(line.amount)! : 0,
        })),
      });
      setNotice(result.replayed ? 'This journal was already posted.' : 'Journal posted and recorded in the audit trail.');
      setDescription(''); setLines(initialLines.map((line, index) => ({ ...line, accountId: accounts[index]?.id ?? '' })));
      setConfirmPost(false); setRevision(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Journal could not be posted.'); setConfirmPost(false); }
    finally { setBusy(false); }
  }

  async function toggleDetails(journal: Journal) {
    if (details[journal.id]) { setDetails(current => { const copy = { ...current }; delete copy[journal.id]; return copy; }); return; }
    try {
      const result = await api.journal(organization.id, journal.id);
      setDetails(current => ({ ...current, [journal.id]: result.journal }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Journal details could not be loaded.'); }
  }

  async function reverse() {
    setBusy(true); setError('');
    try {
      await api.reverseJournal(organization.id, reverseId, {
        idempotencyKey: `reverse:${crypto.randomUUID()}`, reason: reverseReason.trim(),
      });
      setNotice('Reversal posted. The original journal remains unchanged.');
      setReverseId(''); setReverseReason(''); setRevision(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Reversal could not be posted.'); }
    finally { setBusy(false); }
  }

  return <Stack spacing={2}>
    <Typography variant="h5">Journal entries</Typography>
    {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
    {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
    {canPost && <Paper component="form" variant="outlined" onSubmit={post} sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={2}>
        <Typography variant="h6">Manual journal</Typography>
        <TextField required label="Description" value={description} onChange={event => setDescription(event.target.value)} inputProps={{ maxLength: 500 }} />
        {lines.map((line, index) => <Stack key={index} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <Typography sx={{ minWidth: 72 }}>Line {index + 1}</Typography>
          <TextField select label="Account" value={line.accountId} onChange={event => updateLine(index, { accountId: event.target.value })} sx={{ flex: 2 }}>
            {accounts.map(account => <MenuItem key={account.id} value={account.id}>{account.code} · {account.name}</MenuItem>)}
          </TextField>
          <TextField select label="Side" value={line.side} onChange={event => updateLine(index, { side: event.target.value as LineDraft['side'] })} sx={{ flex: 1 }}>
            <MenuItem value="debit">Debit</MenuItem><MenuItem value="credit">Credit</MenuItem>
          </TextField>
          <TextField label="Amount (INR)" inputProps={{ inputMode: 'decimal' }} value={line.amount} onChange={event => updateLine(index, { amount: event.target.value })} sx={{ flex: 1 }} />
          {lines.length > 2 && <Button aria-label={`Remove line ${index + 1}`} onClick={() => setLines(current => current.filter((_, item) => item !== index))}>Remove</Button>}
        </Stack>)}
        <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
          <Typography>Debits {formatPaise(totals.debit)} · Credits {formatPaise(totals.credit)}</Typography>
          <Button onClick={() => setLines(current => [...current, { accountId: accounts[0]?.id ?? '', side: 'debit', amount: '' }])}>Add line</Button>
          <Button type="submit" variant="contained" disabled={busy || loading || !accounts.length}>Review journal</Button>
        </Stack>
      </Stack>
    </Paper>}
    <Typography variant="h6">Posted journals</Typography>
    {loading ? <Typography role="status">Loading journals…</Typography> : !journals.length && <Typography>No posted journals yet.</Typography>}
    {journals.map(journal => {
      const detail = details[journal.id];
      const alreadyReversed = journals.some(row => row.reversalOf === journal.id);
      return <Paper key={journal.id} variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Typography variant="subtitle1" fontWeight={700}>{journal.description}</Typography>
          <Typography color="text.secondary">{new Date(journal.postedAt).toLocaleString('en-IN')} · {journal.lineCount} lines{journal.reversalOf ? ' · Reversal' : ''}</Typography>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            <Button onClick={() => void toggleDetails(journal)}>{detail ? 'Hide details' : 'View details'}</Button>
            {canPost && !journal.reversalOf && !alreadyReversed && <Button onClick={() => { setReverseId(journal.id); setReverseReason(''); }}>Reverse</Button>}
          </Stack>
          {detail && <Stack spacing={0.5}>
            {detail.lines.map((line, index) => {
              const account = accounts.find(item => item.id === line.accountId);
              return <Typography key={index}>{account ? `${account.code} · ${account.name}` : 'Account'} — Debit {formatPaise(line.debitPaise)} / Credit {formatPaise(line.creditPaise)}</Typography>;
            })}
          </Stack>}
        </Stack>
      </Paper>;
    })}
    {next && <Button disabled={loading} onClick={async () => {
      try { const page = await api.journals(organization.id, next); setJournals(current => [...current, ...page.journals]); setNext(page.next); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load more journals.'); }
    }}>Load more journals</Button>}
    <Dialog open={confirmPost} onClose={() => { if (!busy) setConfirmPost(false); }}>
      <DialogTitle>Confirm journal posting</DialogTitle>
      <DialogContent><Stack spacing={1} sx={{ pt: 1 }}>
        <Typography>Post “{description.trim()}” to the ledger?</Typography>
        <Typography>Debits {formatPaise(totals.debit)} · Credits {formatPaise(totals.credit)}</Typography>
        <Typography color="text.secondary">Posted journals cannot be edited. Corrections require a reversal.</Typography>
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setConfirmPost(false)}>Cancel</Button><Button disabled={busy} variant="contained" onClick={() => void confirmAndPost()}>Confirm and post</Button></DialogActions>
    </Dialog>
    <Dialog open={!!reverseId} onClose={() => { if (!busy) setReverseId(''); }}>
      <DialogTitle>Reverse journal</DialogTitle>
      <DialogContent><TextField autoFocus required fullWidth multiline minRows={2} label="Reason for reversal" value={reverseReason} onChange={event => setReverseReason(event.target.value)} sx={{ mt: 1 }} /></DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setReverseId('')}>Cancel</Button><Button disabled={busy || !reverseReason.trim()} onClick={() => void reverse()} variant="contained">Post reversal</Button></DialogActions>
    </Dialog>
  </Stack>;
}
