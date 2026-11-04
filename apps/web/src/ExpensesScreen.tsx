import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, type Account, type Bill, type Contact, type Organization } from './api';

const formatMoney = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
export function ExpensesScreen({ organization }: { organization: Organization }) {
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [vendorId, setVendorId] = useState(''); const [expenseAccountId, setExpenseAccountId] = useState('');
  const [reference, setReference] = useState(''); const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(''); const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0); const [toPost, setToPost] = useState<Bill | null>(null);
  const canWrite = ['owner', 'admin', 'accountant'].includes(organization.role);
  const activeVendors = useMemo(() => vendors.filter(v => v.roles.includes('vendor') && v.active), [vendors]);
  const expenses = useMemo(() => accounts.filter(a => a.type === 'expense' && a.active), [accounts]);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    Promise.all([api.contacts(organization.id), api.accounts(organization.id), api.bills(organization.id)])
      .then(([c, a, b]) => { if (active) { setVendors(c.contacts); setAccounts(a.accounts); setBills(b.bills); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load expense data.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organization.id, revision]);
  async function createDraft(event: FormEvent) {
    event.preventDefault(); const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(amount.trim());
    const rupees = match ? Number(match[1]) : NaN; const fraction = match ? Number((match[2] || '').padEnd(2, '0')) : NaN;
    const paise = rupees * 100 + fraction;
    if (!match || !Number.isSafeInteger(paise) || paise <= 0) { setError('Enter a valid positive INR amount with up to two decimal places.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      await api.createBillDraft(organization.id, { vendorId, vendorReference: reference, expenseAccountId, description, amountPaise: paise, ...(dueDate ? { dueDate } : {}) });
      setNotice('Bill draft saved. It has not affected the ledger.'); setReference(''); setDescription(''); setAmount(''); setRevision(n => n + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Bill draft could not be saved.'); }
    finally { setSaving(false); }
  }
  async function post(bill: Bill) {
    setSaving(true); setError(''); setNotice('');
    try { await api.postBill(organization.id, bill.id, `bill:${bill.id}`); setNotice(`Bill ${bill.vendorReference} posted to accounts payable.`); setToPost(null); setRevision(n => n + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Bill could not be posted.'); }
    finally { setSaving(false); }
  }
  return <Stack spacing={2}>
    <Typography variant="h5">Vendor bills and expenses</Typography>
    <Alert severity="info">This flow records expense bills without GST or inventory. Drafts do not post; confirming a bill debits its selected expense account and credits accounts payable. Vendor payments are a separate workflow.</Alert>
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
    {error && <Alert severity="error" action={<Button onClick={() => setRevision(n => n + 1)}>Reload</Button>}>{error}</Alert>}
    {notice && <Typography role="status">{notice}</Typography>}
    {loading ? <Typography role="status">Loading bills…</Typography> : !error && !bills.length && <Typography>No bills yet.</Typography>}
    {bills.map(bill => <Paper key={bill.id} variant="outlined" sx={{ p: 2 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
      <Stack><Typography variant="h6">{bill.vendorReference} · {bill.vendorName}</Typography><Typography>{bill.status} · {formatMoney(bill.amountPaise)} · {bill.expenseAccountName}</Typography><Typography color="text.secondary">{bill.description}</Typography></Stack>
      {canWrite && bill.status === 'draft' && <Button onClick={() => setToPost(bill)}>Review and post</Button>}
    </Stack></Paper>)}
    <Dialog open={!!toPost} onClose={() => { if (!saving) setToPost(null); }}><DialogTitle>Post this vendor bill?</DialogTitle><DialogContent><DialogContentText>{toPost && `${toPost.vendorName} · ${toPost.vendorReference} · ${formatMoney(toPost.amountPaise)}. This debits ${toPost.expenseAccountName} and credits accounts payable. Posted bill details cannot be edited; correct mistakes with a reversal.`}</DialogContentText></DialogContent><DialogActions><Button disabled={saving} onClick={() => setToPost(null)}>Keep as draft</Button><Button disabled={saving} variant="contained" onClick={() => { if (toPost) void post(toPost); }}>Confirm and post</Button></DialogActions></Dialog>
  </Stack>;
}
