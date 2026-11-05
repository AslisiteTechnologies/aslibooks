import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, type Account, type Bill, type Contact, type Organization, type VendorAdvance, type VendorPayment } from './api';
import { AttachmentsPanel } from './AttachmentsPanel';

const formatMoney = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
export function ExpensesScreen({ organization }: { organization: Organization }) {
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<VendorPayment[]>([]);
  const [advances, setAdvances] = useState<VendorAdvance[]>([]);
  const [vendorId, setVendorId] = useState(''); const [expenseAccountId, setExpenseAccountId] = useState('');
  const [reference, setReference] = useState(''); const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(''); const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0); const [toPost, setToPost] = useState<Bill | null>(null);
  const draftRetry = useRef<{ signature: string; key: string } | null>(null);
  const [toPay, setToPay] = useState<Bill | null>(null); const [cashAccountId, setCashAccountId] = useState(''); const [paymentAmount, setPaymentAmount] = useState('');
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [advanceVendorId, setAdvanceVendorId] = useState(''); const [advanceAmount, setAdvanceAmount] = useState(''); const [advanceConfirm, setAdvanceConfirm] = useState(false);
  const [advanceId, setAdvanceId] = useState(''); const [allocationBillId, setAllocationBillId] = useState(''); const [allocationAmount, setAllocationAmount] = useState(''); const [allocationConfirm, setAllocationConfirm] = useState(false);
  const [advanceKey, setAdvanceKey] = useState(''); const [allocationKey, setAllocationKey] = useState('');
  const [toCredit, setToCredit] = useState<Bill | null>(null); const [creditAmount, setCreditAmount] = useState(''); const [creditReason, setCreditReason] = useState('');
  const canWrite = ['owner', 'admin', 'accountant'].includes(organization.role);
  const activeVendors = useMemo(() => vendors.filter(v => v.roles.includes('vendor') && v.active), [vendors]);
  const expenses = useMemo(() => accounts.filter(a => a.type === 'expense' && a.active), [accounts]);
  const selectedAdvance = advances.find(row => row.id === advanceId);
  const availableBills = bills.filter(bill => bill.vendorId === selectedAdvance?.vendorId && ['posted', 'partially_paid', 'partially_credited'].includes(bill.status) && bill.amountPaise > bill.amountPaidPaise + (bill.amountCreditedPaise ?? 0));
  const selectedAllocationBill = availableBills.find(bill => bill.id === allocationBillId);
  function parseAmount(value: string) { const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value.trim()); const amountPaise = match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : NaN; return Number.isSafeInteger(amountPaise) && amountPaise > 0 ? amountPaise : null; }
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    Promise.all([api.contacts(organization.id), api.accounts(organization.id), api.bills(organization.id), api.vendorPayments(organization.id), api.vendorAdvances(organization.id)])
      .then(([c, a, b, p, advanceResult]) => { if (active) { setVendors(c.contacts); setAccounts(a.accounts); setBills(b.bills); setPayments(p.payments); setAdvances(advanceResult.advances);
        const activeVendor = c.contacts.find(contact => contact.roles.includes('vendor') && contact.active);
        if (!advanceVendorId && activeVendor) setAdvanceVendorId(activeVendor._id);
        setAdvanceId(id => advanceResult.advances.some(row => row.id === id && row.availablePaise > 0) ? id : advanceResult.advances.find(row => row.availablePaise > 0)?.id ?? '');
        if (!cashAccountId) setCashAccountId(a.accounts.find(account => ['1000', '1010'].includes(account.code) && account.active)?.id || ''); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load expense data.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organization.id, revision]);
  async function createDraft(event: FormEvent) {
    event.preventDefault(); const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(amount.trim());
    const rupees = match ? Number(match[1]) : NaN; const fraction = match ? Number((match[2] || '').padEnd(2, '0')) : NaN;
    const paise = rupees * 100 + fraction;
    if (!match || !Number.isSafeInteger(paise) || paise <= 0) { setError('Enter a valid positive INR amount with up to two decimal places.'); return; }
    const input = { vendorId, vendorReference: reference.trim(), expenseAccountId, description: description.trim(), amountPaise: paise, ...(dueDate ? { dueDate } : {}) };
    const signature = JSON.stringify([organization.id, input]);
    if (!draftRetry.current || draftRetry.current.signature !== signature) draftRetry.current = { signature, key: `bill-draft:${crypto.randomUUID()}` };
    setSaving(true); setError(''); setNotice('');
    try {
      await api.createBillDraft(organization.id, { ...input, idempotencyKey: draftRetry.current.key });
      draftRetry.current = null;
      setNotice('Bill draft saved. It has not affected the ledger.'); setReference(''); setDescription(''); setAmount(''); setDueDate(''); setRevision(n => n + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Bill draft could not be saved.'); }
    finally { setSaving(false); }
  }
  async function post(bill: Bill) {
    setSaving(true); setError(''); setNotice('');
    try { await api.postBill(organization.id, bill.id, `bill:${bill.id}`); setNotice(`Bill ${bill.vendorReference} posted to accounts payable.`); setToPost(null); setRevision(n => n + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Bill could not be posted.'); }
    finally { setSaving(false); }
  }
  async function pay(bill: Bill) {
    const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(paymentAmount.trim());
    const paise = match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : NaN;
    const outstanding = bill.amountPaise - bill.amountPaidPaise;
    if (!Number.isSafeInteger(paise) || paise <= 0 || paise > outstanding || !cashAccountId) { setError('Enter a positive payment no greater than the outstanding balance and choose cash or bank.'); return; }
    setSaving(true); setError(''); setNotice('');
    try { await api.recordVendorPayment(organization.id, { idempotencyKey: `vendor-payment:${bill.id}:${bill.amountPaidPaise}:${paise}`, cashAccountId, allocations: [{ billId: bill.id, amountPaise: paise }] }); setNotice(`${formatMoney(paise)} paid to ${bill.vendorName} and allocated to ${bill.vendorReference}.`); setPayDialogOpen(false); setToPay(null); setPaymentAmount(''); setRevision(n => n + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Payment could not be recorded.'); }
    finally { setSaving(false); }
  }
  async function credit(bill: Bill) {
    const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(creditAmount.trim());
    const paise = match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : NaN;
    const outstanding = bill.amountPaise - bill.amountPaidPaise - (bill.amountCreditedPaise ?? 0);
    if (!Number.isSafeInteger(paise) || paise <= 0 || paise > outstanding || creditReason.trim().length < 3) { setError('Enter a positive credit no greater than the unpaid bill and a reason.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      await api.issueVendorCredit(organization.id, bill.id, { idempotencyKey: `vendor-credit:${bill.id}:${bill.amountCreditedPaise ?? 0}:${paise}`, amountPaise: paise, reason: creditReason.trim() });
      setNotice(`Vendor credit of ${formatMoney(paise)} issued. Accounts payable and the expense account were adjusted.`);
      setToCredit(null); setCreditAmount(''); setCreditReason(''); setRevision(n => n + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Vendor credit could not be issued.'); }
    finally { setSaving(false); }
  }
  async function recordAdvance() {
    const amountPaise = parseAmount(advanceAmount); if (!advanceVendorId || !cashAccountId || amountPaise === null) return;
    const key = advanceKey || `vendor-advance:${crypto.randomUUID()}`; setAdvanceKey(key); setSaving(true); setError(''); setNotice('');
    try { await api.recordVendorAdvance(organization.id, { idempotencyKey: key, vendorId: advanceVendorId, cashAccountId, amountPaise });
      setNotice(`${formatMoney(amountPaise)} recorded as a vendor prepayment.`); setAdvanceConfirm(false); setAdvanceAmount(''); setAdvanceKey(''); setRevision(n => n + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Vendor advance could not be recorded.'); }
    finally { setSaving(false); }
  }
  async function allocateAdvance() {
    const amountPaise = parseAmount(allocationAmount); if (!selectedAdvance || !selectedAllocationBill || amountPaise === null) return;
    const outstanding = selectedAllocationBill.amountPaise - selectedAllocationBill.amountPaidPaise - (selectedAllocationBill.amountCreditedPaise ?? 0);
    if (amountPaise > selectedAdvance.availablePaise || amountPaise > outstanding) { setError('Allocation exceeds the available advance or bill balance.'); setAllocationConfirm(false); return; }
    const key = allocationKey || `vendor-advance-allocation:${crypto.randomUUID()}`; setAllocationKey(key); setSaving(true); setError(''); setNotice('');
    try { await api.allocateVendorAdvance(organization.id, selectedAdvance.id, { idempotencyKey: key, billId: selectedAllocationBill.id, amountPaise });
      setNotice(`${formatMoney(amountPaise)} allocated from the vendor advance to ${selectedAllocationBill.vendorReference}.`); setAllocationConfirm(false); setAllocationKey(''); setAllocationAmount(''); setRevision(n => n + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Vendor advance allocation failed.'); }
    finally { setSaving(false); }
  }
  const cashAccounts = accounts.filter(a => a.active && a.type === 'asset' && ['1000', '1010'].includes(a.code));
  return <Stack spacing={2}>
    <Typography variant="h5">Vendor bills and expenses</Typography>
    <Alert severity="info">This flow records expense bills without GST or inventory. Drafts do not post; confirming a bill debits its selected expense account and credits accounts payable. Vendor advances are held as prepayments in account 1400 until allocated to a posted bill.</Alert>
    {canWrite && <Paper variant="outlined" sx={{ p: 2 }}><Stack component="form" spacing={2} onSubmit={e => { void createDraft(e); }}>
      <Typography variant="h6">New bill draft</Typography>
      <TextField select required label="Vendor" value={vendorId} onChange={e => setVendorId(e.target.value)}>{activeVendors.map(v => <MenuItem key={v._id} value={v._id}>{v.displayName}</MenuItem>)}</TextField>
      <TextField required label="Vendor bill reference" value={reference} onChange={e => setReference(e.target.value)} inputProps={{ maxLength: 80 }} />
      <TextField select required label="Expense category" value={expenseAccountId} onChange={e => setExpenseAccountId(e.target.value)}>{expenses.map(a => <MenuItem key={a.id} value={a.id}>{a.code} · {a.name}</MenuItem>)}</TextField>
      <TextField required label="Description" value={description} onChange={e => setDescription(e.target.value)} inputProps={{ maxLength: 500 }} />
      <TextField required label="Amount (INR)" type="number" inputProps={{ min: '0.01', step: '0.01' }} value={amount} onChange={e => setAmount(e.target.value)} />
      <TextField label="Due date" type="date" InputLabelProps={{ shrink: true }} value={dueDate} onChange={e => setDueDate(e.target.value)} />
      <Button type="submit" variant="contained" disabled={saving || !activeVendors.length || !expenses.length}>Save bill draft</Button>
      {!activeVendors.length && <Typography color="text.secondary">Add a vendor in Contacts before entering a bill.</Typography>}
      {!expenses.length && <Typography color="text.secondary">Add an expense account in Accounting first.</Typography>}
    </Stack></Paper>}
    {canWrite && <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={2}>
      <Typography variant="h6">Pay a vendor advance</Typography><Typography color="text.secondary">Prepayments are assets in vendor-advances control account 1400 until applied to a bill.</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField select label="Vendor" value={advanceVendorId} onChange={e => { setAdvanceVendorId(e.target.value); setAdvanceKey(''); }}>{activeVendors.map(v => <MenuItem key={v._id} value={v._id}>{v.displayName}</MenuItem>)}</TextField>
        <TextField select label="Pay from" value={cashAccountId} onChange={e => setCashAccountId(e.target.value)}>{cashAccounts.map(a => <MenuItem key={a.id} value={a.id}>{a.code} · {a.name}</MenuItem>)}</TextField>
        <TextField label="Amount (INR)" value={advanceAmount} onChange={e => { setAdvanceAmount(e.target.value); setAdvanceKey(''); }} inputProps={{ inputMode: 'decimal' }} />
        <Button variant="contained" disabled={saving || loading || !advanceVendorId || !cashAccountId || !parseAmount(advanceAmount) || !accounts.some(a => a.active && a.code === '1400')} onClick={() => setAdvanceConfirm(true)}>Review advance</Button>
      </Stack>
      {!accounts.some(a => a.active && a.code === '1400') && <Typography color="warning.main">Add or activate the starter chart’s vendor-advances account 1400 before recording advances.</Typography>}
      {!!advances.length && <><Typography variant="subtitle1">Vendor advances</Typography>{advances.map(row => <Typography key={row.id}>{row.vendorName} · paid {formatMoney(row.amountPaise)} · available {formatMoney(row.availablePaise)}</Typography>)}</>}
      {!!advances.some(row => row.availablePaise > 0) && <>
        <Typography variant="subtitle1">Allocate advance to a bill</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField select label="Advance" value={advanceId} onChange={e => { setAdvanceId(e.target.value); setAllocationBillId(''); setAllocationKey(''); }}>{advances.filter(row => row.availablePaise > 0).map(row => <MenuItem key={row.id} value={row.id}>{row.vendorName} · available {formatMoney(row.availablePaise)}</MenuItem>)}</TextField>
          <TextField select label="Posted bill" value={allocationBillId} onChange={e => { setAllocationBillId(e.target.value); setAllocationKey(''); }}>{availableBills.map(bill => <MenuItem key={bill.id} value={bill.id}>{bill.vendorReference} · due {formatMoney(bill.amountPaise - bill.amountPaidPaise - (bill.amountCreditedPaise ?? 0))}</MenuItem>)}</TextField>
          <TextField label="Amount to allocate (INR)" value={allocationAmount} onChange={e => { setAllocationAmount(e.target.value); setAllocationKey(''); }} inputProps={{ inputMode: 'decimal' }} />
          <Button variant="outlined" disabled={saving || !selectedAllocationBill || !parseAmount(allocationAmount)} onClick={() => setAllocationConfirm(true)}>Review allocation</Button>
        </Stack>
      </>}
    </Stack></Paper>}
    {error && <Alert severity="error" action={<Button onClick={() => setRevision(n => n + 1)}>Reload</Button>}>{error}</Alert>}
    {notice && <Typography role="status">{notice}</Typography>}
    {loading ? <Typography role="status">Loading bills…</Typography> : !error && !bills.length && <Typography>No bills yet.</Typography>}
    {bills.map(bill => <Paper key={bill.id} variant="outlined" sx={{ p: 2 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
      <Stack><Typography variant="h6">{bill.vendorReference} · {bill.vendorName}</Typography><Typography>{bill.status}{bill.dueDate ? ` · due ${bill.dueDate}` : ''}{bill.overdue ? ' · overdue' : ''} · {formatMoney(bill.amountPaise)} · {bill.expenseAccountName}</Typography><Typography color="text.secondary">{bill.description}</Typography></Stack>
      {canWrite && bill.status === 'draft' && <Button onClick={() => setToPost(bill)}>Review and post</Button>}
      {canWrite && ['posted', 'partially_paid', 'partially_credited'].includes(bill.status) && <>
        <Button onClick={() => { setToPay({ ...bill }); setPaymentAmount(((bill.amountPaise - bill.amountPaidPaise - (bill.amountCreditedPaise ?? 0)) / 100).toFixed(2)); setPayDialogOpen(true); }}>Record payment</Button>
        <Button onClick={() => { setToCredit(bill); setCreditAmount(((bill.amountPaise - bill.amountPaidPaise - (bill.amountCreditedPaise ?? 0)) / 100).toFixed(2)); }}>Issue vendor credit</Button>
      </>}
    </Stack><AttachmentsPanel organizationId={organization.id} resourceType="bill" resourceId={bill.id} canWrite={canWrite} /></Paper>)}
    {payments.map(payment => <Paper key={payment.id} variant="outlined" sx={{ p: 2 }}><Typography>{payment.vendorName} · {formatMoney(payment.amountPaise)} paid · {payment.allocations.map(a => a.vendorReference).join(', ')}</Typography></Paper>)}
    <Dialog open={!!toPost} onClose={() => { if (!saving) setToPost(null); }}><DialogTitle>Post this vendor bill?</DialogTitle><DialogContent><DialogContentText>{toPost && `${toPost.vendorName} · ${toPost.vendorReference} · ${formatMoney(toPost.amountPaise)}. This debits ${toPost.expenseAccountName} and credits accounts payable. Posted bill details cannot be edited; correct mistakes with a reversal.`}</DialogContentText></DialogContent><DialogActions><Button disabled={saving} onClick={() => setToPost(null)}>Keep as draft</Button><Button disabled={saving} variant="contained" onClick={() => { if (toPost) void post(toPost); }}>Confirm and post</Button></DialogActions></Dialog>
    <Dialog open={payDialogOpen} onClose={(_event, reason) => { if (!saving && reason === 'escapeKeyDown') { setPayDialogOpen(false); setToPay(null); } }}><DialogTitle>Record vendor payment</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <Typography>{toPay && `${toPay.vendorName} · ${toPay.vendorReference} · outstanding ${formatMoney(toPay.amountPaise - toPay.amountPaidPaise)}`}</Typography>
      <TextField select required label="Pay from cash or bank" value={cashAccountId} onChange={e => setCashAccountId(e.target.value)}>{cashAccounts.map(a => <MenuItem key={a.id} value={a.id}>{a.code} · {a.name}</MenuItem>)}</TextField>
      <TextField required label="Amount paid (INR)" type="number" inputProps={{ min: '0.01', step: '0.01' }} value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
    </Stack></DialogContent><DialogActions><Button disabled={saving} onClick={() => { setPayDialogOpen(false); setToPay(null); }}>Cancel</Button><Button disabled={saving || !cashAccounts.length} variant="contained" onClick={() => { if (toPay) void pay(toPay); }}>Review and record payment</Button></DialogActions></Dialog>
    <Dialog open={!!toCredit} onClose={() => { if (!saving) setToCredit(null); }}><DialogTitle>Review vendor credit</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <Typography>{toCredit && `${toCredit.vendorReference} · ${toCredit.vendorName}. This reduces accounts payable and the selected expense account. It does not request a cash refund.`}</Typography>
      <TextField required label="Credit amount (INR)" type="number" inputProps={{ min: '0.01', step: '0.01' }} value={creditAmount} onChange={e => setCreditAmount(e.target.value)} />
      <TextField required label="Reason" value={creditReason} inputProps={{ maxLength: 500 }} onChange={e => setCreditReason(e.target.value)} />
    </Stack></DialogContent><DialogActions><Button disabled={saving} onClick={() => setToCredit(null)}>Cancel</Button><Button disabled={saving} variant="contained" onClick={() => { if (toCredit) void credit(toCredit); }}>Confirm and issue</Button></DialogActions></Dialog>
    <Dialog open={advanceConfirm} onClose={() => { if (!saving) setAdvanceConfirm(false); }}><DialogTitle>Confirm vendor prepayment</DialogTitle><DialogContent><DialogContentText>{formatMoney(parseAmount(advanceAmount) ?? 0)} paid to {activeVendors.find(v => v._id === advanceVendorId)?.displayName}. This debits vendor advances account 1400 and credits cash/bank; it is not an expense yet.</DialogContentText></DialogContent><DialogActions><Button disabled={saving} onClick={() => setAdvanceConfirm(false)}>Back</Button><Button disabled={saving} variant="contained" onClick={() => void recordAdvance()}>Confirm payment</Button></DialogActions></Dialog>
    <Dialog open={allocationConfirm} onClose={() => { if (!saving) setAllocationConfirm(false); }}><DialogTitle>Confirm vendor advance allocation</DialogTitle><DialogContent><DialogContentText>{formatMoney(parseAmount(allocationAmount) ?? 0)} from {selectedAdvance?.vendorName} applied to bill {selectedAllocationBill?.vendorReference}. This reduces the prepayment and accounts payable balances.</DialogContentText></DialogContent><DialogActions><Button disabled={saving} onClick={() => setAllocationConfirm(false)}>Back</Button><Button disabled={saving} variant="contained" onClick={() => void allocateAdvance()}>Confirm allocation</Button></DialogActions></Dialog>
  </Stack>;
}
