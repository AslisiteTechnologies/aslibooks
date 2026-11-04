import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, type Account, type Invoice, type Organization, type Receipt } from './api';

const formatMoney = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
function parsePaise(value: string): number | null {
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(value)) return null;
  const [rupees, fraction = ''] = value.split('.');
  const paise = BigInt(rupees) * 100n + BigInt(fraction.padEnd(2, '0'));
  return paise > 0n && paise <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(paise) : null;
}

export function ReceiptsScreen({ organization }: { organization: Organization }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [revision, setRevision] = useState(0);
  const canWrite = ['owner', 'admin', 'accountant'].includes(organization.role);
  const outstandingInvoices = useMemo(() => invoices.filter(invoice =>
    (invoice.status === 'issued' || invoice.status === 'partially_paid') && invoice.totalPaise > invoice.amountPaidPaise,
  ), [invoices]);
  const selectedInvoice = outstandingInvoices.find(invoice => invoice.id === invoiceId);
  const outstanding = selectedInvoice ? selectedInvoice.totalPaise - selectedInvoice.amountPaidPaise : 0;
  const parsedAmount = parsePaise(amount);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    Promise.all([api.invoices(organization.id), api.accounts(organization.id), api.receipts(organization.id)])
      .then(([invoiceResult, accountResult, receiptResult]) => {
        if (!active) return;
        setInvoices(invoiceResult.invoices); setAccounts(accountResult.accounts); setReceipts(receiptResult.receipts);
        const open = invoiceResult.invoices.find(invoice => invoice.status === 'issued' || invoice.status === 'partially_paid');
        if (!invoiceId && open) { setInvoiceId(open.id); setAmount(((open.totalPaise - open.amountPaidPaise) / 100).toFixed(2)); }
        const cash = accountResult.accounts.find(account => account.active && ['1000', '1010'].includes(account.code));
        if (!cashAccountId && cash) setCashAccountId(cash.id);
      }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load receipts.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organization.id, revision]);

  function selectInvoice(id: string) {
    const selected = outstandingInvoices.find(invoice => invoice.id === id);
    setInvoiceId(id); setAmount(selected ? ((selected.totalPaise - selected.amountPaidPaise) / 100).toFixed(2) : '');
    setIdempotencyKey(''); setError('');
  }

  function review(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!selectedInvoice || !cashAccountId || parsedAmount === null || parsedAmount > outstanding) {
      setError('Choose an eligible invoice and cash/bank account, then enter a positive amount within its outstanding balance.'); return;
    }
    setConfirm(true);
  }

  async function record() {
    if (!selectedInvoice || parsedAmount === null) return;
    const key = idempotencyKey || `receipt:${crypto.randomUUID()}`;
    setIdempotencyKey(key); setSaving(true); setError(''); setNotice('');
    try {
      const result = await api.recordReceipt(organization.id, {
        idempotencyKey: key, cashAccountId,
        allocations: [{ invoiceId: selectedInvoice.id, amountPaise: parsedAmount }],
      });
      setNotice(`${formatMoney(result.amountPaise)} received and allocated to ${selectedInvoice.invoiceNumber}.`);
      setConfirm(false); setIdempotencyKey(''); setRevision(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Receipt could not be recorded.'); }
    finally { setSaving(false); }
  }

  return <Stack spacing={2}>
    <Typography variant="h5">Customer receipts</Typography>
    <Alert severity="info">Receipts are allocated to one issued invoice at a time. Cash and bank deposits post to starter chart accounts 1000 or 1010. No unallocated advances or refunds are supported yet.</Alert>
    {canWrite && <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack component="form" spacing={2} onSubmit={review}>
        <Typography variant="h6">Record a customer payment</Typography>
        <TextField select required disabled={loading || saving} label="Invoice" value={invoiceId} onChange={event => selectInvoice(event.target.value)}>
          {outstandingInvoices.map(invoice => <MenuItem key={invoice.id} value={invoice.id}>
            {invoice.invoiceNumber} · {invoice.customerName} · outstanding {formatMoney(invoice.totalPaise - invoice.amountPaidPaise)}
          </MenuItem>)}
        </TextField>
        <TextField select required disabled={loading || saving} label="Deposit to" value={cashAccountId} onChange={event => { setCashAccountId(event.target.value); setIdempotencyKey(''); }}>
          {accounts.filter(account => account.active && ['1000', '1010'].includes(account.code)).map(account =>
            <MenuItem key={account.id} value={account.id}>{account.code} · {account.name}</MenuItem>)}
        </TextField>
        <TextField required disabled={loading || saving} label="Amount received (₹)" inputProps={{ inputMode: 'decimal' }} value={amount}
          onChange={event => { setAmount(event.target.value); setIdempotencyKey(''); }} />
        {selectedInvoice && <Typography>Outstanding after receipt: {formatMoney(outstanding - (parsedAmount ?? 0))}</Typography>}
        <Button type="submit" variant="contained" disabled={saving || loading || !outstandingInvoices.length || !cashAccountId}>Review receipt</Button>
        {!outstandingInvoices.length && <Typography color="text.secondary">No issued invoices have an outstanding balance.</Typography>}
      </Stack>
    </Paper>}
    {error && <Alert severity="error" action={<Button onClick={() => setRevision(value => value + 1)}>Reload</Button>}>{error}</Alert>}
    {notice && <Typography role="status">{notice}</Typography>}
    <Typography variant="h6">Recent receipts</Typography>
    {loading ? <Typography role="status">Loading receipts…</Typography> : !receipts.length && <Typography>No receipts recorded yet.</Typography>}
    {receipts.map(receipt => <Paper key={receipt.id} variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle1">{receipt.customerName} · {formatMoney(receipt.amountPaise)}</Typography>
      {receipt.allocations.map(allocation => <Typography key={allocation.invoiceId}>{allocation.invoiceNumber} · {formatMoney(allocation.amountPaise)}</Typography>)}
      <Typography color="text.secondary">{new Date(receipt.receivedAt).toLocaleString('en-IN')}</Typography>
    </Paper>)}
    <Dialog open={confirm} onClose={() => { if (!saving) setConfirm(false); }}>
      <DialogTitle>Confirm receipt allocation</DialogTitle>
      <DialogContent><DialogContentText>
        {selectedInvoice && `${formatMoney(parsedAmount ?? 0)} to ${cashAccountId === accounts.find(account => account.code === '1000')?.id ? 'cash' : 'bank'}, allocated to ${selectedInvoice.invoiceNumber}. The receipt and balanced cash/receivables journal post together.`}
      </DialogContentText></DialogContent>
      <DialogActions>
        <Button disabled={saving} onClick={() => setConfirm(false)}>Back</Button>
        <Button disabled={saving} variant="contained" onClick={() => void record()}>Confirm and record</Button>
      </DialogActions>
    </Dialog>
  </Stack>;
}
