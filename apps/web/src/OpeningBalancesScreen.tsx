import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, type Account, type OpeningBalance, type Organization } from './api';

type BalanceLine = { accountId: string; amount: string };
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value / 100);
function toPaise(value: string) {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return NaN;
  return Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
}
function fiscalStartDate() {
  const fields = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]));
  const year = Number(fields.year) - (Number(fields.month) < 4 ? 1 : 0);
  return `${year}-04-01`;
}

export function OpeningBalancesScreen({ organization }: { organization: Organization }) {
  const [accounts, setAccounts] = useState<Account[]>([]); const [opening, setOpening] = useState<OpeningBalance | null>(null);
  const [asOf] = useState(fiscalStartDate()); const [lines, setLines] = useState<BalanceLine[]>([{ accountId: '', amount: '' }, { accountId: '', amount: '' }]);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [confirm, setConfirm] = useState(false);
  const canWrite = ['owner', 'admin', 'accountant'].includes(organization.role);
  useEffect(() => { let active = true; setLoading(true); setError(''); Promise.all([api.accounts(organization.id), api.openingBalance(organization.id)])
    .then(([accountResult, openingResult]) => { if (active) { setAccounts(accountResult.accounts.filter(account => account.active)); setOpening(openingResult.opening); } })
    .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load opening balances.'); })
    .finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [organization.id]);
  const available = useMemo(() => accounts.filter(account => ['asset', 'liability', 'equity'].includes(account.type)), [accounts]);
  const debitTotal = lines.reduce((sum, line) => sum + (available.find(a => a.id === line.accountId)?.type === 'asset' ? Math.max(0, toPaise(line.amount) || 0) : 0), 0);
  const creditTotal = lines.reduce((sum, line) => { const account = available.find(a => a.id === line.accountId); return sum + (account && account.type !== 'asset' ? Math.max(0, toPaise(line.amount) || 0) : 0); }, 0);
  const valid = lines.length >= 2 && lines.every(line => line.accountId && Number.isSafeInteger(toPaise(line.amount)) && toPaise(line.amount) > 0) &&
    new Set(lines.map(line => line.accountId)).size === lines.length && debitTotal > 0 && debitTotal === creditTotal;
  async function submit() {
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await api.postOpeningBalance(organization.id, { idempotencyKey: `opening:${organization.id}:${asOf}`, asOf,
        balances: lines.map(line => ({ accountId: line.accountId, amountPaise: toPaise(line.amount) })) });
      const saved = await api.openingBalance(organization.id); setOpening(saved.opening); setConfirm(false); setNotice(`Opening balances posted to the ledger (${money(result.totalPaise)} debit and credit).`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Opening balances could not be posted.'); }
    finally { setSaving(false); }
  }
  if (loading) return <Typography role="status">Loading opening balances…</Typography>;
  return <Stack spacing={2}>
    <Typography variant="h5">Opening balances</Typography>
    <Alert severity="info">Enter each opening balance sheet account at the start of this fiscal year. Assets are debits; liabilities and equity are credits. The entries must balance explicitly. No equity offset is generated for you. This can be posted once; corrections require an authorized reversal.</Alert>
    {error && <Alert severity="error">{error}</Alert>}{notice && <Typography role="status">{notice}</Typography>}
    {opening ? <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={1}><Typography variant="h6">Opening balances recorded</Typography><Typography>As of {opening.asOf} · {money(opening.totalPaise)} per side</Typography>
      {opening.lines.map(line => <Typography key={line.accountId}>{line.accountCode} · {line.accountName} — {line.side} {money(line.amountPaise)}</Typography>)}
      <Typography color="text.secondary">Journal {opening.journalId}</Typography></Stack></Paper> : canWrite ? <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={2}>
      <Typography variant="h6">Set initial ledger balances</Typography>
      <TextField label="Fiscal year starts on" type="date" value={asOf} InputLabelProps={{ shrink: true }} disabled />
      {lines.map((line, index) => { const selected = available.find(account => account.id === line.accountId); return <Stack key={index} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField select fullWidth required label={`Account ${index + 1}`} value={line.accountId} onChange={event => setLines(current => current.map((row, i) => i === index ? { ...row, accountId: event.target.value } : row))}>
          {available.filter(account => account.id === line.accountId || !lines.some((row, i) => i !== index && row.accountId === account.id)).map(account => <MenuItem key={account.id} value={account.id}>{account.code} · {account.name} ({account.type})</MenuItem>)}
        </TextField>
        <TextField fullWidth required label={`Amount (INR) · ${selected?.type === 'asset' ? 'Debit' : selected ? 'Credit' : 'choose account'}`} type="number" inputProps={{ min: '0.01', step: '0.01' }} value={line.amount}
          onChange={event => setLines(current => current.map((row, i) => i === index ? { ...row, amount: event.target.value } : row))} />
        {lines.length > 2 && <Button onClick={() => setLines(current => current.filter((_, i) => i !== index))}>Remove</Button>}
      </Stack>; })}
      <Button onClick={() => setLines(current => [...current, { accountId: '', amount: '' }])} disabled={lines.length >= 20}>Add balance</Button>
      <Typography>Debits {money(debitTotal)} · Credits {money(creditTotal)} {valid ? '· Balanced' : '· Not balanced'}</Typography>
      <Button variant="contained" disabled={!valid || saving} onClick={() => setConfirm(true)}>Review opening balances</Button>
    </Stack></Paper> : <Alert severity="info">You have read-only access to opening balances.</Alert>}
    <Dialog open={confirm} onClose={() => { if (!saving) setConfirm(false); }}><DialogTitle>Post opening balances?</DialogTitle><DialogContent><DialogContentText>These entries post once on {asOf}. Debits and credits each total {money(debitTotal)}. Posted facts cannot be edited; the accounts will appear in the general ledger and financial statements.</DialogContentText></DialogContent><DialogActions><Button disabled={saving} onClick={() => setConfirm(false)}>Review entries</Button><Button disabled={saving} variant="contained" onClick={() => { void submit(); }}>Confirm and post</Button></DialogActions></Dialog>
  </Stack>;
}
