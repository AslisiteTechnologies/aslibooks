import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, type Contact, type Invoice, type InvoiceDocument, type Organization, type Product } from './api';
import { AttachmentsPanel } from './AttachmentsPanel';

const formatMoney = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function SalesScreen({ organization }: { organization: Organization }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [draftLines, setDraftLines] = useState<Array<{ productId: string; quantity: string }>>([{ productId: '', quantity: '1' }]);
  const [dueDate, setDueDate] = useState('');
  const [taxTreatment, setTaxTreatment] = useState<'none' | 'exclusive' | 'inclusive'>('none');
  const [placeOfSupplyStateCode, setPlaceOfSupplyStateCode] = useState('');
  const [supplyKind, setSupplyKind] = useState<'intra_state' | 'inter_state'>('intra_state');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [toIssue, setToIssue] = useState<Invoice | null>(null);
  const [toCredit, setToCredit] = useState<Invoice | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [printInvoice, setPrintInvoice] = useState<InvoiceDocument | null>(null);
  const [documentError, setDocumentError] = useState('');
  const draftRetry = useRef<{ signature: string; idempotencyKey: string } | null>(null);
  const canWrite = ['owner', 'admin', 'accountant'].includes(organization.role);
  const customers = useMemo(() => contacts.filter(contact => contact.roles.includes('customer')), [contacts]);
  const totalPaise = draftLines.reduce((total, line) => {
    const product = products.find(item => item._id === line.productId);
    const quantity = Number(line.quantity);
    const lineTotal = product && Number.isSafeInteger(quantity) && quantity > 0 ? product.unitPricePaise * quantity : 0;
    return Number.isSafeInteger(total + lineTotal) ? total + lineTotal : Number.NaN;
  }, 0);
  const needsTax = draftLines.some(line => {
    const product = products.find(item => item._id === line.productId);
    return product?.taxCategory === 'taxable' && (product.gstRateBasisPoints ?? 0) > 0;
  });

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    Promise.all([api.contacts(organization.id), api.products(organization.id), api.invoices(organization.id)])
      .then(([contactResult, productResult, invoiceResult]) => {
        if (!active) return;
        setContacts(contactResult.contacts); setProducts(productResult.products); setInvoices(invoiceResult.invoices);
        setDraftLines(lines => lines.map((line, index) => index === 0 && !line.productId && productResult.products.length
          ? { ...line, productId: productResult.products[0]._id } : line));
      }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load sales data.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organization.id, revision]);

  async function createDraft(event: FormEvent) {
    event.preventDefault();
    if (!customerId || !draftLines.length || draftLines.some(line => !line.productId || !Number.isSafeInteger(Number(line.quantity)) || Number(line.quantity) < 1)
      || !Number.isSafeInteger(totalPaise) || totalPaise <= 0) {
      setError('Choose a customer and give every invoice line a service and valid whole-number quantity.'); return;
    }
    if (needsTax && (taxTreatment === 'none' || !/^\d{2}$/.test(placeOfSupplyStateCode))) {
      setError('Select an explicit tax price basis and two-digit place-of-supply state code.'); return;
    }
    setSaving(true); setError(''); setNotice('');
    try {
      const payload = {
        customerId, lines: draftLines.map(line => ({ productId: line.productId, quantity: Number(line.quantity) })), ...(dueDate ? { dueDate } : {}),
        ...(needsTax ? { taxTreatment: { kind: taxTreatment, placeOfSupplyStateCode, supplyKind } } : {}),
      };
      const signature = `${organization.id}:${JSON.stringify(payload)}`;
      const idempotencyKey = draftRetry.current?.signature === signature
        ? draftRetry.current.idempotencyKey
        : `invoice-draft:${crypto.randomUUID()}`;
      draftRetry.current = { signature, idempotencyKey };
      const result = await api.createInvoiceDraft(organization.id, { ...payload, idempotencyKey });
      draftRetry.current = null;
      setNotice('Draft saved. No journal or income has been recorded. Tax-bearing drafts are retained for review and cannot be posted yet.'); setDueDate(''); setRevision(value => value + 1);
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

  async function issueCredit(invoice: Invoice) {
    const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(creditAmount.trim());
    const paise = match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : NaN;
    const outstanding = invoice.totalPaise - invoice.amountPaidPaise - (invoice.amountCreditedPaise ?? 0);
    if (!Number.isSafeInteger(paise) || paise <= 0 || paise > outstanding || creditReason.trim().length < 3) { setError('Enter a positive credit no greater than the unpaid amount and a reason.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      await api.issueCreditNote(organization.id, invoice.id, { idempotencyKey: `credit-note:${invoice.id}:${invoice.amountCreditedPaise ?? 0}:${paise}`, amountPaise: paise, reason: creditReason.trim() });
      setNotice(`Credit note issued for ${formatMoney(paise)}. Accounts receivable and sales income were adjusted.`);
      setToCredit(null); setCreditAmount(''); setCreditReason(''); setRevision(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Credit note could not be issued.'); }
    finally { setSaving(false); }
  }

  async function loadInvoiceDocument(invoice: Invoice) {
    setDocumentError('');
    try { setPrintInvoice((await api.invoice(organization.id, invoice.id)).invoice); }
    catch (cause) { setDocumentError(cause instanceof Error ? cause.message : 'Invoice details could not be loaded.'); }
  }

  function printDocument() {
    if (!printInvoice?.invoiceNumber || printInvoice.status === 'draft') return;
    const popup = window.open('', '_blank');
    if (!popup) { setDocumentError('Allow pop-ups to print this invoice.'); return; }
    const rows = printInvoice.lines.map(line => `<tr><td>${escapeHtml(line.name)}</td><td>${line.quantity} ${escapeHtml(line.unit)}</td><td>${formatMoney(line.unitPricePaise)}</td><td>${formatMoney(line.lineTotalPaise)}</td></tr>`).join('');
    const credited = printInvoice.amountCreditedPaise ?? 0;
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(printInvoice.invoiceNumber)}</title><style>body{font:14px Arial,sans-serif;color:#17202a;margin:40px}h1{margin-bottom:4px}.muted{color:#5d6875}table{width:100%;border-collapse:collapse;margin-top:28px}th,td{padding:10px;border-bottom:1px solid #d7dce1;text-align:left}td:nth-child(n+2),th:nth-child(n+2){text-align:right}.total{text-align:right;margin-top:24px;font-size:18px}.notice{margin-top:36px;color:#5d6875}</style></head><body><h1>Invoice ${escapeHtml(printInvoice.invoiceNumber)}</h1><div class="muted">${escapeHtml(organization.name)}</div><p>Bill to: <strong>${escapeHtml(printInvoice.customerName)}</strong><br>Issued: ${printInvoice.issuedAt ? escapeHtml(new Date(printInvoice.issuedAt).toLocaleDateString('en-IN')) : '—'}<br>Due: ${printInvoice.dueDate ? escapeHtml(printInvoice.dueDate) : '—'}</p><table><thead><tr><th>Service</th><th>Quantity</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="total">Total: <strong>${formatMoney(printInvoice.totalPaise)}</strong><br>Credits: ${formatMoney(credited)}<br>Paid: ${formatMoney(printInvoice.amountPaidPaise)}<br>Balance due: <strong>${formatMoney(printInvoice.totalPaise - printInvoice.amountPaidPaise - credited)}</strong></div><p class="notice">Service invoice. Tax is not included in this document.</p><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  }

  return <Stack spacing={2}>
    <Typography variant="h5">Sales invoices</Typography>
    <Alert severity="info">Tax categories and paise calculations are recorded as draft data only. Tax-bearing invoices cannot be posted until rates, supply classification and journal treatment receive qualified review. Do not treat these fields as GST compliance advice.</Alert>
    {canWrite && <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack component="form" spacing={2} onSubmit={event => { void createDraft(event); }}>
        <Typography variant="h6">New service invoice draft</Typography>
        <TextField select required label="Customer" value={customerId} onChange={event => setCustomerId(event.target.value)}>
          {customers.map(customer => <MenuItem key={customer._id} value={customer._id}>{customer.displayName}</MenuItem>)}
        </TextField>
        {draftLines.map((line, index) => <Stack key={index} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <TextField select required label={index === 0 ? 'Service' : `Service ${index + 1}`} value={line.productId}
            onChange={event => setDraftLines(lines => lines.map((item, lineIndex) => lineIndex === index ? { ...item, productId: event.target.value } : item))}>
            {products.map(product => <MenuItem key={product._id} value={product._id}>{product.code} · {product.name} — {formatMoney(product.unitPricePaise)} · {product.taxCategory.replaceAll('_', ' ')}</MenuItem>)}
          </TextField>
          <TextField required label={index === 0 ? 'Quantity' : `Quantity ${index + 1}`} type="number" inputProps={{ min: 1, max: 1000000, step: 1 }} value={line.quantity}
            onChange={event => setDraftLines(lines => lines.map((item, lineIndex) => lineIndex === index ? { ...item, quantity: event.target.value } : item))} />
          {draftLines.length > 1 && <Button type="button" onClick={() => setDraftLines(lines => lines.filter((_, lineIndex) => lineIndex !== index))}>Remove line {index + 1}</Button>}
        </Stack>)}
        <Button type="button" onClick={() => setDraftLines(lines => [...lines, { productId: products[0]?._id ?? '', quantity: '1' }])} disabled={!products.length}>Add service line</Button>
        <TextField label="Due date" type="date" slotProps={{ inputLabel: { shrink: true } }} value={dueDate}
          onChange={event => setDueDate(event.target.value)} />
        {needsTax && <>
          <TextField select required label="Configured tax price basis" value={taxTreatment} onChange={event => setTaxTreatment(event.target.value as typeof taxTreatment)}>
            <MenuItem value="none">Choose tax basis</MenuItem><MenuItem value="exclusive">Price excludes configured tax</MenuItem><MenuItem value="inclusive">Price includes configured tax</MenuItem>
          </TextField>
          <TextField required label="Place-of-supply state code" inputProps={{ maxLength: 2, inputMode: 'numeric' }} helperText="Enter the applicable two-digit code after professional review."
            value={placeOfSupplyStateCode} onChange={event => setPlaceOfSupplyStateCode(event.target.value.replace(/\D/g, '').slice(0, 2))} />
          <TextField select required label="Tax component treatment" value={supplyKind} onChange={event => setSupplyKind(event.target.value as typeof supplyKind)}>
            <MenuItem value="intra_state">Central plus state components</MenuItem><MenuItem value="inter_state">Integrated component</MenuItem>
          </TextField>
          <Typography>Configured product rates · draft only</Typography>
        </>}
        <Typography>Invoice line total: {formatMoney(totalPaise)}{taxTreatment === 'exclusive' ? ' before configured tax' : taxTreatment === 'inclusive' ? ' including configured tax' : ''}</Typography>
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
          <Typography>{invoice.status}{invoice.dueDate ? ` · due ${invoice.dueDate}` : ''}{invoice.overdue ? ' · overdue' : ''} · {formatMoney(invoice.totalPaise - (invoice.amountCreditedPaise ?? 0))} balance before receipts</Typography>
          {(invoice.totalTaxPaise ?? 0) > 0 && <Typography variant="body2" color="text.secondary">Taxable {formatMoney(invoice.taxableSubtotalPaise ?? 0)} · CGST {formatMoney(invoice.cgstPaise ?? 0)} · SGST {formatMoney(invoice.sgstPaise ?? 0)} · IGST {formatMoney(invoice.igstPaise ?? 0)} · total tax {formatMoney(invoice.totalTaxPaise ?? 0)}</Typography>}
        </Stack>
        {canWrite && invoice.status === 'draft' && (invoice.gstReviewRequired || (invoice.totalTaxPaise ?? 0) > 0 || (invoice.taxTreatment && invoice.taxTreatment !== 'none')
          ? <Button disabled>Tax review required before issue</Button>
          : <Button onClick={() => setToIssue(invoice)}>Review and issue</Button>)}
        {invoice.status !== 'draft' && <Button onClick={() => void loadInvoiceDocument(invoice)}>Print invoice</Button>}
        {canWrite && ['issued', 'partially_paid', 'partially_credited'].includes(invoice.status) && invoice.totalPaise > invoice.amountPaidPaise + (invoice.amountCreditedPaise ?? 0) && <Button onClick={() => { setToCredit(invoice); setCreditAmount(((invoice.totalPaise - invoice.amountPaidPaise - (invoice.amountCreditedPaise ?? 0)) / 100).toFixed(2)); }}>Issue credit note</Button>}
      </Stack>
      <AttachmentsPanel organizationId={organization.id} resourceType="invoice" resourceId={invoice.id} canWrite={canWrite} />
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
    <Dialog open={!!toCredit} onClose={() => { if (!saving) setToCredit(null); }}>
      <DialogTitle>Review credit note</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <DialogContentText>{toCredit && `${toCredit.invoiceNumber} · ${toCredit.customerName}. This adjusts sales income and accounts receivable. It does not issue a cash refund.`}</DialogContentText>
        <TextField required label="Credit amount (INR)" type="number" inputProps={{ min: '0.01', step: '0.01' }} value={creditAmount} onChange={event => setCreditAmount(event.target.value)} />
        <TextField required label="Reason" value={creditReason} inputProps={{ maxLength: 500 }} onChange={event => setCreditReason(event.target.value)} />
      </Stack></DialogContent>
      <DialogActions><Button disabled={saving} onClick={() => setToCredit(null)}>Cancel</Button><Button disabled={saving} variant="contained" onClick={() => { if (toCredit) void issueCredit(toCredit); }}>Confirm and issue</Button></DialogActions>
    </Dialog>
    <Dialog open={!!printInvoice} onClose={() => setPrintInvoice(null)} fullWidth maxWidth="sm">
      <DialogTitle>Invoice {printInvoice?.invoiceNumber}</DialogTitle>
      <DialogContent><Stack spacing={1} sx={{ py: 1 }}>
        <Typography>{organization.name} · {printInvoice?.customerName}</Typography>
        <Typography color="text.secondary">{printInvoice?.lines.map(line => `${line.name} × ${line.quantity} ${line.unit}`).join(', ')}</Typography>
        <Typography>Total {formatMoney(printInvoice?.totalPaise ?? 0)} · Paid {formatMoney(printInvoice?.amountPaidPaise ?? 0)} · Due {formatMoney((printInvoice?.totalPaise ?? 0) - (printInvoice?.amountPaidPaise ?? 0))}</Typography>
        <Typography variant="caption">Tax is not included in this document.</Typography>
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setPrintInvoice(null)}>Close</Button><Button variant="contained" onClick={printDocument}>Print</Button></DialogActions>
    </Dialog>
    {documentError && <Alert severity="error" onClose={() => setDocumentError('')}>{documentError}</Alert>}
  </Stack>;
}

