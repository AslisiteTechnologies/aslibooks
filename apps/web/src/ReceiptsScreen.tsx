import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, type Account, type Contact, type CustomerAdvance, type Invoice, type Organization, type Receipt } from './api';

const formatMoney = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
function parsePaise(value: string): number | null {
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(value)) return null;
  const [rupees, fraction = ''] = value.split('.');
  const paise = BigInt(rupees) * 100n + BigInt(fraction.padEnd(2, '0'));
  return paise > 0n && paise <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(paise) : null;
}

export function ReceiptsScreen({ organization }: { organization: Organization }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceNext, setInvoiceNext] = useState<string | null>(null);
  const [loadingMoreInvoices, setLoadingMoreInvoices] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptNext, setReceiptNext] = useState<string | null>(null);
  const [loadingMoreReceipts, setLoadingMoreReceipts] = useState(false);
  const [customers, setCustomers] = useState<Contact[]>([]); const [advances, setAdvances] = useState<CustomerAdvance[]>([]);
  const [receiptAllocations, setReceiptAllocations] = useState<Array<{ invoiceId: string; amount: string }>>([{ invoiceId: '', amount: '' }]);
  const [cashAccountId, setCashAccountId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [revision, setRevision] = useState(0);
  const [advanceCustomerId, setAdvanceCustomerId] = useState(''); const [advanceAmount, setAdvanceAmount] = useState(''); const [advanceConfirm, setAdvanceConfirm] = useState(false);
  const [advanceId, setAdvanceId] = useState(''); const [allocationInvoiceId, setAllocationInvoiceId] = useState(''); const [allocationAmount, setAllocationAmount] = useState(''); const [allocationConfirm, setAllocationConfirm] = useState(false);
  const [advanceKey, setAdvanceKey] = useState(''); const [allocationKey, setAllocationKey] = useState('');
  const [refundAdvanceId, setRefundAdvanceId] = useState(''); const [refundAmount, setRefundAmount] = useState(''); const [refundKey, setRefundKey] = useState(''); const [refundConfirm, setRefundConfirm] = useState(false);
  const canWrite = ['owner', 'admin', 'accountant'].includes(organization.role);
  const outstandingInvoices = useMemo(() => invoices.filter(invoice =>
    ['issued', 'partially_paid', 'partially_credited'].includes(invoice.status) && invoice.totalPaise > invoice.amountPaidPaise + (invoice.amountCreditedPaise ?? 0),
  ), [invoices]);
  const parsedReceiptAllocations = useMemo(() => receiptAllocations.map(row => ({
    invoice: outstandingInvoices.find(invoice => invoice.id === row.invoiceId),
    amountPaise: parsePaise(row.amount),
  })), [receiptAllocations, outstandingInvoices]);
  const receiptTotalPaise = parsedReceiptAllocations.reduce((sum, row) => sum + (row.amountPaise ?? 0), 0);
  const receiptAllocationValid = parsedReceiptAllocations.length > 0 &&
    parsedReceiptAllocations.every(row => row.invoice && row.amountPaise !== null && row.amountPaise <= row.invoice.totalPaise - row.invoice.amountPaidPaise - (row.invoice.amountCreditedPaise ?? 0)) &&
    new Set(receiptAllocations.map(row => row.invoiceId).filter(Boolean)).size === receiptAllocations.length &&
    new Set(parsedReceiptAllocations.map(row => row.invoice?.customerId)).size === 1 &&
    Number.isSafeInteger(receiptTotalPaise) && receiptTotalPaise > 0;
  const selectedAdvance = advances.find(row => row.id === advanceId);
  const advanceInvoices = outstandingInvoices.filter(invoice => invoice.customerId === selectedAdvance?.customerId);
  const selectedAllocationInvoice = advanceInvoices.find(invoice => invoice.id === allocationInvoiceId);
  const parsedAdvanceAmount = parsePaise(advanceAmount); const parsedAllocationAmount = parsePaise(allocationAmount);
  const selectedRefundAdvance = advances.find(row => row.id === refundAdvanceId); const parsedRefundAmount = parsePaise(refundAmount);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    Promise.all([api.invoices(organization.id), api.accounts(organization.id), api.receipts(organization.id), api.customerAdvances(organization.id), api.contacts(organization.id)])
      .then(async ([invoiceResult, accountResult, receiptResult, advanceResult, contactResult]) => {
        if (!active) return;
        const allCustomers = [...contactResult.contacts.filter(contact => contact.roles.includes('customer'))]; let after = contactResult.next;
        while (after) { const page = await api.contacts(organization.id, '', after); allCustomers.push(...page.contacts.filter(contact => contact.roles.includes('customer'))); after = page.next; }
        if (!active) return;
        setInvoices(invoiceResult.invoices); setInvoiceNext(invoiceResult.next); setAccounts(accountResult.accounts); setReceipts(receiptResult.receipts); setReceiptNext(receiptResult.next); setAdvances(advanceResult.advances); setCustomers(allCustomers);
        const open = invoiceResult.invoices.find(invoice => ['issued', 'partially_paid', 'partially_credited'].includes(invoice.status) && invoice.totalPaise > invoice.amountPaidPaise + (invoice.amountCreditedPaise ?? 0));
        const selectedInvoiceIsOpen = invoiceResult.invoices.some(invoice => invoice.id === receiptAllocations[0]?.invoiceId &&
          ['issued', 'partially_paid', 'partially_credited'].includes(invoice.status) && invoice.totalPaise > invoice.amountPaidPaise + (invoice.amountCreditedPaise ?? 0));
        if (!selectedInvoiceIsOpen) setReceiptAllocations([open
          ? { invoiceId: open.id, amount: ((open.totalPaise - open.amountPaidPaise - (open.amountCreditedPaise ?? 0)) / 100).toFixed(2) }
          : { invoiceId: '', amount: '' },
        ]);
        const cash = accountResult.accounts.find(account => account.active && ['1000', '1010'].includes(account.code));
        if (!cashAccountId && cash) setCashAccountId(cash.id);
        if (!advanceCustomerId && allCustomers[0]) setAdvanceCustomerId(allCustomers[0]._id);
        if (!advanceId && advanceResult.advances.find(row => row.availablePaise > 0)) setAdvanceId(advanceResult.advances.find(row => row.availablePaise > 0)!.id);
      }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load receipts.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organization.id, revision]);
  async function loadMoreInvoices() {
    if (!invoiceNext || loadingMoreInvoices) return;
    setLoadingMoreInvoices(true); setError('');
    try { const page = await api.invoices(organization.id, invoiceNext); setInvoices(current => [...current, ...page.invoices.filter(invoice => !current.some(existing => existing.id === invoice.id))]); setInvoiceNext(page.next); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'More invoices could not be loaded.'); }
    finally { setLoadingMoreInvoices(false); }
  }
  async function loadMoreReceipts() {
    if (!receiptNext || loadingMoreReceipts) return;
    setLoadingMoreReceipts(true); setError('');
    try { const page = await api.receipts(organization.id, receiptNext); setReceipts(current => [...current, ...page.receipts.filter(receipt => !current.some(existing => existing.id === receipt.id))]); setReceiptNext(page.next); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'More receipts could not be loaded.'); }
    finally { setLoadingMoreReceipts(false); }
  }

  function selectInvoice(index: number, id: string) {
    const selected = outstandingInvoices.find(invoice => invoice.id === id);
    setReceiptAllocations(rows => rows.map((row, rowIndex) => rowIndex === index ? {
      invoiceId: id,
      amount: selected ? ((selected.totalPaise - selected.amountPaidPaise - (selected.amountCreditedPaise ?? 0)) / 100).toFixed(2) : '',
    } : row));
    setIdempotencyKey(''); setError('');
  }

  function review(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!receiptAllocationValid || !cashAccountId) {
      setError('Choose unique outstanding invoices for one customer, enter a positive amount within each balance, and select a cash or bank account.'); return;
    }
    setConfirm(true);
  }

  async function record() {
    if (!receiptAllocationValid) return;
    const key = idempotencyKey || `receipt:${crypto.randomUUID()}`;
    setIdempotencyKey(key); setSaving(true); setError(''); setNotice('');
    try {
      const result = await api.recordReceipt(organization.id, {
        idempotencyKey: key, cashAccountId,
        allocations: parsedReceiptAllocations.map(row => ({ invoiceId: row.invoice!.id, amountPaise: row.amountPaise! })),
      });
      setNotice(`${formatMoney(result.amountPaise)} received and allocated across ${parsedReceiptAllocations.length} invoice${parsedReceiptAllocations.length === 1 ? '' : 's'}.`);
      setConfirm(false); setIdempotencyKey(''); setRevision(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Receipt could not be recorded.'); }
    finally { setSaving(false); }
  }

  async function recordAdvance() {
    if (!advanceCustomerId || !cashAccountId || parsedAdvanceAmount === null) return;
    const key = advanceKey || `customer-advance:${crypto.randomUUID()}`; setAdvanceKey(key); setSaving(true); setError(''); setNotice('');
    try { await api.recordCustomerAdvance(organization.id, { idempotencyKey: key, customerId: advanceCustomerId, cashAccountId, amountPaise: parsedAdvanceAmount });
      setNotice(`${formatMoney(parsedAdvanceAmount)} recorded as a customer advance.`); setAdvanceConfirm(false); setAdvanceAmount(''); setAdvanceKey(''); setRevision(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Customer advance could not be recorded.'); }
    finally { setSaving(false); }
  }

  async function allocateAdvance() {
    if (!selectedAdvance || !selectedAllocationInvoice || parsedAllocationAmount === null) return;
    const invoiceOutstanding = selectedAllocationInvoice.totalPaise - selectedAllocationInvoice.amountPaidPaise - (selectedAllocationInvoice.amountCreditedPaise ?? 0);
    if (parsedAllocationAmount > selectedAdvance.availablePaise || parsedAllocationAmount > invoiceOutstanding) { setError('Allocation exceeds the available advance or invoice balance.'); setAllocationConfirm(false); return; }
    const key = allocationKey || `advance-allocation:${crypto.randomUUID()}`; setAllocationKey(key); setSaving(true); setError(''); setNotice('');
    try { await api.allocateCustomerAdvance(organization.id, selectedAdvance.id, { idempotencyKey: key, invoiceId: selectedAllocationInvoice.id, amountPaise: parsedAllocationAmount });
      setNotice(`${formatMoney(parsedAllocationAmount)} allocated from the advance to ${selectedAllocationInvoice.invoiceNumber}.`); setAllocationConfirm(false); setAllocationKey(''); setAllocationAmount(''); setRevision(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Advance allocation could not be recorded.'); }
    finally { setSaving(false); }
  }

  async function refundAdvance() {
    if (!selectedRefundAdvance || !cashAccountId || parsedRefundAmount === null || parsedRefundAmount > selectedRefundAdvance.availablePaise) return;
    const key = refundKey || `advance-refund:${crypto.randomUUID()}`; setRefundKey(key); setSaving(true); setError(''); setNotice('');
    try { await api.refundCustomerAdvance(organization.id, selectedRefundAdvance.id, { idempotencyKey: key, cashAccountId, amountPaise: parsedRefundAmount });
      setNotice(`${formatMoney(parsedRefundAmount)} refunded from ${selectedRefundAdvance.customerName}’s advance.`); setRefundConfirm(false); setRefundKey(''); setRefundAmount(''); setRevision(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Customer advance refund could not be recorded.'); }
    finally { setSaving(false); }
  }

  return <Stack spacing={2}>
    <Typography variant="h5">Customer receipts</Typography>
    {invoiceNext && <Button variant="outlined" disabled={loadingMoreInvoices} onClick={() => void loadMoreInvoices()}>{loadingMoreInvoices ? 'Loading invoices…' : 'Load more invoices for allocation'}</Button>}
    <Alert severity="info">Receipts and customer advances post to the ledger. Advances are held in customer-advances account 2210 until allocated to an invoice or refunded.</Alert>
    {canWrite && <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack component="form" spacing={2} onSubmit={review}>
        <Typography variant="h6">Record a customer payment</Typography>
        {receiptAllocations.map((allocation, index) => <Stack key={index} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField select required disabled={loading || saving} label={`Invoice ${index + 1}`} value={allocation.invoiceId} onChange={event => selectInvoice(index, event.target.value)}>
            {outstandingInvoices.filter(invoice => !receiptAllocations.some((row, rowIndex) => rowIndex !== index && row.invoiceId === invoice.id) && (!receiptAllocations.some(row => row.invoiceId) || outstandingInvoices.find(row => row.id === receiptAllocations.find(row => row.invoiceId)?.invoiceId)?.customerId === invoice.customerId)).map(invoice => <MenuItem key={invoice.id} value={invoice.id}>
              {invoice.invoiceNumber} · {invoice.customerName} · outstanding {formatMoney(invoice.totalPaise - invoice.amountPaidPaise - (invoice.amountCreditedPaise ?? 0))}
            </MenuItem>)}
          </TextField>
          <TextField required disabled={loading || saving} label="Amount received (₹)" inputProps={{ inputMode: 'decimal' }} value={allocation.amount}
            onChange={event => { setReceiptAllocations(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, amount: event.target.value } : row)); setIdempotencyKey(''); }} />
          {receiptAllocations.length > 1 && <Button color="inherit" onClick={() => { setReceiptAllocations(rows => rows.filter((_row, rowIndex) => rowIndex !== index)); setIdempotencyKey(''); }}>Remove</Button>}
        </Stack>)}
        <Button disabled={saving || loading || receiptAllocations.length >= 50 || !receiptAllocations.every(row => row.invoiceId)} onClick={() => { setReceiptAllocations(rows => [...rows, { invoiceId: '', amount: '' }]); setIdempotencyKey(''); }}>Add invoice allocation</Button>
        <TextField select required disabled={loading || saving} label="Deposit to" value={cashAccountId} onChange={event => { setCashAccountId(event.target.value); setIdempotencyKey(''); }}>
          {accounts.filter(account => account.active && ['1000', '1010'].includes(account.code)).map(account =>
            <MenuItem key={account.id} value={account.id}>{account.code} · {account.name}</MenuItem>)}
        </TextField>
        <Typography>Total receipt: {formatMoney(receiptTotalPaise)}</Typography>
        <Button type="submit" variant="contained" disabled={saving || loading || !outstandingInvoices.length || !cashAccountId}>Review receipt</Button>
        {!outstandingInvoices.length && <Typography color="text.secondary">No issued invoices have an outstanding balance.</Typography>}
      </Stack>
    </Paper>}
    {canWrite && <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h6">Receive a customer advance</Typography>
        <Typography color="text.secondary">Money received before it can be applied to an invoice is recorded as a liability in customer-advances control account 2210, not as income.</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField select required label="Customer" value={advanceCustomerId} onChange={event => { setAdvanceCustomerId(event.target.value); setAdvanceKey(''); }}>
            {customers.filter(customer => customer.active).map(customer => <MenuItem key={customer._id} value={customer._id}>{customer.displayName}</MenuItem>)}
          </TextField>
          <TextField select required label="Deposit to" value={cashAccountId} onChange={event => { setCashAccountId(event.target.value); setAdvanceKey(''); }}>
            {accounts.filter(account => account.active && ['1000', '1010'].includes(account.code)).map(account => <MenuItem key={account.id} value={account.id}>{account.code} · {account.name}</MenuItem>)}
          </TextField>
          <TextField required label="Amount received (₹)" value={advanceAmount} onChange={event => { setAdvanceAmount(event.target.value); setAdvanceKey(''); }} inputProps={{ inputMode: 'decimal' }} />
          <Button variant="contained" disabled={saving || loading || !advanceCustomerId || !cashAccountId || !parsedAdvanceAmount} onClick={() => setAdvanceConfirm(true)}>Review advance</Button>
        </Stack>
        {!!advances.length && <><Typography variant="subtitle1">Customer advances</Typography>{advances.map(row => <Typography key={row.id}>{row.customerName} · received {formatMoney(row.amountPaise)} · allocated {formatMoney(row.allocatedPaise)} · refunded {formatMoney(row.refundedPaise)} · available {formatMoney(row.availablePaise)} · {new Date(row.receivedAt).toLocaleDateString('en-IN')}</Typography>)}</>}
        {!!advances.some(row => row.availablePaise > 0) && <>
          <Typography variant="subtitle1">Refund an unallocated advance</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField select label="Advance" value={refundAdvanceId} onChange={event => { setRefundAdvanceId(event.target.value); setRefundKey(''); }}>
              {advances.filter(row => row.availablePaise > 0).map(row => <MenuItem key={row.id} value={row.id}>{row.customerName} · available {formatMoney(row.availablePaise)}</MenuItem>)}
            </TextField>
            <TextField select label="Refund from" value={cashAccountId} onChange={event => { setCashAccountId(event.target.value); setRefundKey(''); }}>
              {accounts.filter(account => account.active && ['1000', '1010'].includes(account.code)).map(account => <MenuItem key={account.id} value={account.id}>{account.code} · {account.name}</MenuItem>)}
            </TextField>
            <TextField label="Refund amount (₹)" value={refundAmount} onChange={event => { setRefundAmount(event.target.value); setRefundKey(''); }} inputProps={{ inputMode: 'decimal' }} />
            <Button variant="outlined" disabled={saving || !selectedRefundAdvance || !parsedRefundAmount || parsedRefundAmount > (selectedRefundAdvance?.availablePaise ?? 0)} onClick={() => setRefundConfirm(true)}>Review refund</Button>
          </Stack>
        </>}
        {!!advances.some(row => row.availablePaise > 0) && <>
          <Typography variant="subtitle1">Allocate an advance to an invoice</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField select label="Advance" value={advanceId} onChange={event => { setAdvanceId(event.target.value); setAllocationInvoiceId(''); setAllocationKey(''); }}>
              {advances.filter(row => row.availablePaise > 0).map(row => <MenuItem key={row.id} value={row.id}>{row.customerName} · available {formatMoney(row.availablePaise)}</MenuItem>)}
            </TextField>
            <TextField select label="Customer invoice" value={allocationInvoiceId} onChange={event => { setAllocationInvoiceId(event.target.value); setAllocationKey(''); }}>
              {advanceInvoices.map(invoice => <MenuItem key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} · due {formatMoney(invoice.totalPaise - invoice.amountPaidPaise - (invoice.amountCreditedPaise ?? 0))}</MenuItem>)}
            </TextField>
            <TextField label="Amount to allocate (₹)" value={allocationAmount} onChange={event => { setAllocationAmount(event.target.value); setAllocationKey(''); }} inputProps={{ inputMode: 'decimal' }} />
            <Button variant="outlined" disabled={saving || !selectedAllocationInvoice || !parsedAllocationAmount} onClick={() => setAllocationConfirm(true)}>Review allocation</Button>
          </Stack>
        </>}
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
    {receiptNext && <Button variant="outlined" disabled={loadingMoreReceipts} onClick={() => void loadMoreReceipts()}>{loadingMoreReceipts ? 'Loading receipts…' : 'Load more receipts'}</Button>}
    <Dialog open={confirm} onClose={() => { if (!saving) setConfirm(false); }}>
      <DialogTitle>Confirm receipt allocation</DialogTitle>
      <DialogContent><DialogContentText>
        {`${formatMoney(receiptTotalPaise)} to ${cashAccountId === accounts.find(account => account.code === '1000')?.id ? 'cash' : 'bank'}, allocated across ${parsedReceiptAllocations.map(row => row.invoice?.invoiceNumber).join(', ')}. The receipt and balanced cash/receivables journal post together.`}
      </DialogContentText></DialogContent>
      <DialogActions>
        <Button disabled={saving} onClick={() => setConfirm(false)}>Back</Button>
        <Button disabled={saving} variant="contained" onClick={() => void record()}>Confirm and record</Button>
      </DialogActions>
    </Dialog>
    <Dialog open={advanceConfirm} onClose={() => { if (!saving) setAdvanceConfirm(false); }}>
      <DialogTitle>Confirm customer advance</DialogTitle><DialogContent><DialogContentText>{formatMoney(parsedAdvanceAmount ?? 0)} received from {customers.find(row => row._id === advanceCustomerId)?.displayName ?? 'the selected customer'}. This posts cash/bank against liability account 2210 and does not recognize income.</DialogContentText></DialogContent>
      <DialogActions><Button disabled={saving} onClick={() => setAdvanceConfirm(false)}>Back</Button><Button disabled={saving} variant="contained" onClick={() => void recordAdvance()}>Confirm and record</Button></DialogActions>
    </Dialog>
    <Dialog open={allocationConfirm} onClose={() => { if (!saving) setAllocationConfirm(false); }}>
      <DialogTitle>Confirm advance allocation</DialogTitle><DialogContent><DialogContentText>{formatMoney(parsedAllocationAmount ?? 0)} from {selectedAdvance?.customerName} allocated to {selectedAllocationInvoice?.invoiceNumber}. This reduces the advance liability and the customer receivable in a balanced journal.</DialogContentText></DialogContent>
      <DialogActions><Button disabled={saving} onClick={() => setAllocationConfirm(false)}>Back</Button><Button disabled={saving} variant="contained" onClick={() => void allocateAdvance()}>Confirm allocation</Button></DialogActions>
    </Dialog>
    <Dialog open={refundConfirm} onClose={() => { if (!saving) setRefundConfirm(false); }}>
      <DialogTitle>Confirm customer advance refund</DialogTitle><DialogContent><DialogContentText>{formatMoney(parsedRefundAmount ?? 0)} refunded to {selectedRefundAdvance?.customerName}. This debits customer-advances liability 2210 and credits the selected cash/bank account. The amount must remain unallocated and the refund will be audited.</DialogContentText></DialogContent>
      <DialogActions><Button disabled={saving} onClick={() => setRefundConfirm(false)}>Back</Button><Button disabled={saving} variant="contained" onClick={() => void refundAdvance()}>Confirm refund</Button></DialogActions>
    </Dialog>
  </Stack>;
}
