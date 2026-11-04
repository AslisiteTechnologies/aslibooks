import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, type Contact, type Invoice, type Organization, type Product } from './api';

const formatMoney = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);

export function SalesScreen({ organization }: { organization: Organization }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [toIssue, setToIssue] = useState<Invoice | null>(null);
  const canWrite = ['owner', 'admin', 'accountant'].includes(organization.role);
  const customers = useMemo(() => contacts.filter(contact => contact.roles.includes('customer')), [contacts]);
  const selectedProduct = products.find(product => product._id === productId);
  const totalPaise = selectedProduct && Number.isInteger(Number(quantity)) && Number(quantity) > 0
    ? selectedProduct.unitPricePaise * Number(quantity) : 0;

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    Promise.all([api.contacts(organization.id), api.products(organization.id), api.invoices(organization.id)])
      .then(([contactResult, productResult, invoiceResult]) => {
        if (!active) return;
        setContacts(contactResult.contacts); setProducts(productResult.products); setInvoices(invoiceResult.invoices);
        if (!productId && productResult.products.length) setProductId(productResult.products[0]._id);
      }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load sales data.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organization.id, revision]);

  async function createDraft(event: FormEvent) {
    event.preventDefault();
    if (!customerId || !productId || !Number.isSafeInteger(totalPaise) || totalPaise <= 0) {
      setError('Choose a customer and service with a valid quantity.'); return;
    }
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await api.createInvoiceDraft(organization.id, {
        customerId, lines: [{ productId, quantity: Number(quantity) }],
      });
      setNotice('Draft saved. No journal or income has been recorded.'); setRevision(value => value + 1);
      return result.id;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Draft could not be saved.'); }
    finally { setSaving(false); }
  }

  async function issue(invoice: Invoice) {
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await api.issueInvoice(organization.id, invoice.id, `invoice:${invoice.id}`);
      setNotice(`Invoice ${result.invoiceNumber} issued and posted to the ledger.`);
      setToIssue(null); setRevision(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invoice could not be issued.'); }
    finally { setSaving(false); }
  }

  return <Stack spacing={2}>
    <Typography variant="h5">Sales invoices</Typography>
    <Alert severity="info">This first invoice flow is for services without GST or discounts. Tax and inventory accounting are not included; do not issue invoices that require them.</Alert>
    {canWrite && <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack component="form" spacing={2} onSubmit={event => { void createDraft(event); }}>
        <Typography variant="h6">New service invoice draft</Typography>
        <TextField select required label="Customer" value={customerId} onChange={event => setCustomerId(event.target.value)}>
          {customers.map(customer => <MenuItem key={customer._id} value={customer._id}>{customer.displayName}</MenuItem>)}
        </TextField>
        <TextField select required label="Service" value={productId} onChange={event => setProductId(event.target.value)}>
          {products.map(product => <MenuItem key={product._id} value={product._id}>{product.code} · {product.name} — {formatMoney(product.unitPricePaise)}</MenuItem>)}
        </TextField>
        <TextField required label="Quantity" type="number" inputProps={{ min: 1, max: 1000000, step: 1 }} value={quantity}
          onChange={event => setQuantity(event.target.value)} />
        <Typography>Total before tax: {formatMoney(totalPaise)}</Typography>
        <Button type="submit" variant="contained" disabled={saving || !customers.length || !products.length}>Save draft</Button>
        {!customers.length && <Typography color="text.secondary">Add a customer in Contacts before drafting an invoice.</Typography>}
        {!products.length && <Typography color="text.secondary">Add a service under Products before drafting an invoice.</Typography>}
      </Stack>
    </Paper>}
    {error && <Alert severity="error" action={<Button onClick={() => setRevision(value => value + 1)}>Reload</Button>}>{error}</Alert>}
    {notice && <Typography role="status">{notice}</Typography>}
    {loading ? <Typography role="status">Loading invoices…</Typography> : !error && !invoices.length && <Typography>No invoices yet.</Typography>}
    {invoices.map(invoice => <Paper key={invoice.id} variant="outlined" sx={{ p: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
        <Stack spacing={0.5}>
          <Typography variant="h6">{invoice.invoiceNumber || 'Draft invoice'} · {invoice.customerName}</Typography>
          <Typography>{invoice.status} · {formatMoney(invoice.totalPaise)}</Typography>
        </Stack>
        {canWrite && invoice.status === 'draft' && <Button onClick={() => setToIssue(invoice)}>Review and issue</Button>}
      </Stack>
    </Paper>)}
    <Dialog open={!!toIssue} onClose={() => { if (!saving) setToIssue(null); }}>
      <DialogTitle>Issue this invoice?</DialogTitle>
      <DialogContent><DialogContentText>
        {toIssue && `${toIssue.customerName} · ${formatMoney(toIssue.totalPaise)}. Issuing assigns a fiscal-year invoice number and posts accounts receivable against sales income. This action cannot be edited; correct it with a reversal.`}
      </DialogContentText></DialogContent>
      <DialogActions>
        <Button disabled={saving} onClick={() => setToIssue(null)}>Keep as draft</Button>
        <Button disabled={saving} variant="contained" onClick={() => { if (toIssue) void issue(toIssue); }}>Confirm and issue</Button>
      </DialogActions>
    </Dialog>
  </Stack>;
}
