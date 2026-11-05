import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { api, type Account, type BankReconciliation, type BankTransaction, type CashTransfer, type Organization } from './api';

function parseCsv(source: string) {
  const text = source.replace(/^\uFEFF/, ''); const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ',') { row.push(cell); cell = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) { if (char === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift()?.map(value => value.trim());
  if (!header || header.join('|') !== 'transactionDate|amountPaise|description') throw new Error('CSV headers must be transactionDate,amountPaise,description (amounts are signed integer paise).');
  return rows.filter(values => values.some(value => value.trim())).map(values => {
    if (values.length !== 3) throw new Error('Each CSV line must contain exactly three columns.');
    const [transactionDate, rawAmount, description] = values;
    const amountPaise = Number(rawAmount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate) || !Number.isSafeInteger(amountPaise) || amountPaise === 0 || !description.trim()) throw new Error('Each line needs a valid date, nonzero integer paise amount and description.');
    return { transactionDate, amountPaise, description: description.trim() };
  });
}
function todayIndia() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`;
}
function paiseInput(value: string) {
  if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(value)) return null;
  const amount = Number(value) * 100; return Number.isSafeInteger(amount) ? amount : null;
}
function money(value: number) { return `${value < 0 ? '−' : ''}₹${(Math.abs(value) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export function BankingScreen({ organization }: { organization: Organization }) {
  const [accounts, setAccounts] = useState<Account[]>([]); const [accountId, setAccountId] = useState('');
  const [transactions, setTransactions] = useState<BankTransaction[]>([]); const [reconciliations, setReconciliations] = useState<BankReconciliation[]>([]);
  const [transfers, setTransfers] = useState<CashTransfer[]>([]); const [fromAccountId, setFromAccountId] = useState(''); const [toAccountId, setToAccountId] = useState(''); const [transferAmount, setTransferAmount] = useState('');
  const [journalIds, setJournalIds] = useState<Record<string, string>>({}); const [periodStart, setPeriodStart] = useState(`${todayIndia().slice(0, 7)}-01`);
  const [periodEnd, setPeriodEnd] = useState(todayIndia()); const [opening, setOpening] = useState('0.00'); const [closing, setClosing] = useState('0.00');
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const bankAccounts = useMemo(() => accounts.filter(account => account.active && account.code === '1010' && account.type === 'asset'), [accounts]);
  async function load() {
    setLoading(true); setError('');
    try {
      const [page, transferPage] = await Promise.all([api.bankStatement(organization.id, accountId), api.transfers(organization.id)]);
      setTransactions(page.transactions); setReconciliations(page.reconciliations); setTransfers(transferPage.transfers);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Bank activity could not be loaded.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { let current = true; void api.accounts(organization.id).then(result => {
    if (!current) return; const banks = result.accounts.filter(a => a.active && a.code === '1010' && a.type === 'asset'); const cashAndBanks = result.accounts.filter(a => a.active && ['1000', '1010'].includes(a.code) && a.type === 'asset'); setAccounts(result.accounts); setAccountId(id => id && banks.some(a => a.id === id) ? id : banks[0]?.id ?? ''); setFromAccountId(id => id && cashAndBanks.some(a => a.id === id) ? id : cashAndBanks[0]?.id ?? ''); setToAccountId(id => id && cashAndBanks.some(a => a.id === id) ? id : cashAndBanks.find(a => a.id !== cashAndBanks[0]?.id)?.id ?? '');
  }).catch(cause => { if (current) setError(cause instanceof Error ? cause.message : 'Accounts could not be loaded.'); }); return () => { current = false; }; }, [organization.id]);
  useEffect(() => { if (accountId) void load(); }, [organization.id, accountId]);
  async function importFile(file?: File) {
    if (!file || !accountId) return;
    try { const rows = parseCsv(await file.text()); if (!rows.length) throw new Error('CSV has no statement rows.');
      const result = await api.importBankStatement(organization.id, accountId, rows); setNotice(`Imported ${result.imported} lines; skipped ${result.duplicates} duplicates.`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'CSV import failed.'); }
  }
  async function match(id: string) {
    try { await api.matchBankTransaction(organization.id, id, journalIds[id]?.trim() ?? ''); setNotice('Statement line matched to the journal.'); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not match statement line.'); }
  }
  async function reconcile() {
    const openingBalancePaise = paiseInput(opening); const closingBalancePaise = paiseInput(closing);
    if (!accountId || !openingBalancePaise && openingBalancePaise !== 0 || !closingBalancePaise && closingBalancePaise !== 0) { setError('Enter valid opening and closing balances in rupees.'); return; }
    try { const result = await api.reconcileBankStatement(organization.id, { accountId, periodStart, periodEnd, openingBalancePaise, closingBalancePaise }); setNotice(`Reconciliation ${result.replayed ? 'already exists' : 'saved'} for ${result.transactionCount} statement lines.`); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Reconciliation failed.'); }
  }
  async function transfer() {
    const amountPaise = paiseInput(transferAmount);
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId || !amountPaise || amountPaise <= 0) { setError('Choose different cash/bank accounts and enter a positive amount.'); return; }
    try { const result = await api.createTransfer(organization.id, { idempotencyKey: crypto.randomUUID(), fromAccountId, toAccountId, amountPaise }); setNotice(`Transfer ${result.replayed ? 'already recorded' : 'posted'} to the ledger.`); setTransferAmount(''); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Transfer could not be recorded.'); }
  }
  return <Stack spacing={2}>
    {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}{notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
    {!bankAccounts.length ? <Paper variant="outlined" sx={{ p: 3 }}><Typography>Add the starter chart of accounts to enable bank statement reconciliation.</Typography></Paper> : <>
      <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={2}>
        <Typography variant="h6">Transfer between cash and bank</Typography>
        <Typography variant="body2" color="text.secondary">Moves value between two cash or bank accounts. This posts a balanced journal without changing income or expenses.</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField select label="From account" value={fromAccountId} onChange={event => setFromAccountId(event.target.value)}>{accounts.filter(a => a.active && ['1000', '1010'].includes(a.code) && a.type === 'asset').map(a => <MenuItem key={a.id} value={a.id}>{a.code} · {a.name}</MenuItem>)}</TextField>
          <TextField select label="To account" value={toAccountId} onChange={event => setToAccountId(event.target.value)}>{accounts.filter(a => a.active && ['1000', '1010'].includes(a.code) && a.type === 'asset').map(a => <MenuItem key={a.id} value={a.id}>{a.code} · {a.name}</MenuItem>)}</TextField>
          <TextField label="Amount (₹)" value={transferAmount} onChange={event => setTransferAmount(event.target.value)} inputMode="decimal" />
          <Button variant="contained" onClick={() => void transfer()} disabled={!fromAccountId || !toAccountId || fromAccountId === toAccountId}>Record transfer</Button>
        </Stack>
        {!!transfers.length && <><Typography variant="subtitle1">Recent transfers</Typography>{transfers.map(item => <Typography key={item.id} variant="body2">{new Date(item.transferredAt).toLocaleDateString('en-IN')} · {item.fromAccountName} → {item.toAccountName} · {money(item.amountPaise)} · journal {item.journalId}</Typography>)}</>}
      </Stack></Paper>
      <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={2}>
        <Typography variant="h6">Import bank statement</Typography><TextField select label="Bank account" value={accountId} onChange={event => setAccountId(event.target.value)}>{bankAccounts.map(account => <MenuItem key={account.id} value={account.id}>{account.code} · {account.name}</MenuItem>)}</TextField>
        <Typography variant="body2" color="text.secondary">CSV columns: transactionDate,amountPaise,description. Deposits are positive; withdrawals are negative. Importing does not post journals.</Typography>
        <Button component="label" variant="outlined">Choose CSV<input hidden type="file" accept=".csv,text/csv" onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ''; }} /></Button>
      </Stack></Paper>
      <Paper variant="outlined" sx={{ p: 2, overflowX: 'auto' }}><Stack spacing={2}><Typography variant="h6">Statement activity</Typography>{loading ? <Typography role="status">Loading bank activity…</Typography> : !transactions.length ? <Typography color="text.secondary">No statement lines yet.</Typography> : <Table size="small"><TableHead><TableRow><TableCell>Date</TableCell><TableCell>Description</TableCell><TableCell align="right">Movement</TableCell><TableCell>Status</TableCell><TableCell>Match journal</TableCell></TableRow></TableHead><TableBody>{transactions.map(transaction => <TableRow key={transaction.id}><TableCell>{transaction.transactionDate}</TableCell><TableCell>{transaction.description}</TableCell><TableCell align="right">{money(transaction.amountPaise)}</TableCell><TableCell>{transaction.status}</TableCell><TableCell>{transaction.status === 'unmatched' ? <Stack direction="row" spacing={1}><TextField size="small" label="Journal ID" value={journalIds[transaction.id] ?? ''} onChange={event => setJournalIds(values => ({ ...values, [transaction.id]: event.target.value }))} inputProps={{ 'aria-label': `Journal ID for ${transaction.description}` }} /><Button onClick={() => void match(transaction.id)} disabled={!journalIds[transaction.id]?.trim()}>Match</Button></Stack> : transaction.journalId ?? '—'}</TableCell></TableRow>)}</TableBody></Table>}</Stack></Paper>
      <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={2}><Typography variant="h6">Reconcile period</Typography><Typography variant="body2" color="text.secondary">Balances are checked against posted ledger activity. Resolve all imported unmatched lines before reconciling.</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField type="date" label="From" value={periodStart} onChange={event => setPeriodStart(event.target.value)} InputLabelProps={{ shrink: true }} /><TextField type="date" label="Through" value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} InputLabelProps={{ shrink: true }} /></Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField label="Opening balance (₹)" value={opening} onChange={event => setOpening(event.target.value)} inputMode="decimal" /><TextField label="Closing balance (₹)" value={closing} onChange={event => setClosing(event.target.value)} inputMode="decimal" /></Stack>
        <Button variant="contained" onClick={() => void reconcile()} disabled={!accountId}>Reconcile statement</Button>
        {!!reconciliations.length && <><Typography variant="subtitle1">Saved reconciliations</Typography>{reconciliations.map(item => <Typography key={item.id} variant="body2">{item.periodStart} to {item.periodEnd} · {item.transactionCount} lines · {money(item.closingBalancePaise)} reconciled to ledger</Typography>)}</>}
      </Stack></Paper>
    </>}
  </Stack>;
}
