import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, type Organization, type Product } from './api';

export function ProductsScreen({ organization }: { organization: Organization }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('unit');
  const [price, setPrice] = useState('');
  const [hsnSacCode, setHsnSacCode] = useState('');
  const [taxCategory, setTaxCategory] = useState<'not_configured' | 'taxable' | 'exempt' | 'nil_rated' | 'non_gst'>('not_configured');
  const [gstRate, setGstRate] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string; unit: string; price: string; hsnSacCode: string; taxCategory: Product['taxCategory']; gstRate: string } | null>(null);
  const [archiving, setArchiving] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const canWrite = ['owner', 'admin', 'accountant'].includes(organization.role);
  useEffect(() => {
    let active = true;
    api.products(organization.id, query).then(result => { if (active) { setProducts(result.products); setError(''); } })
      .catch(() => { if (active) setError('Unable to load services.'); });
    return () => { active = false; };
  }, [organization.id, query, version]);
  async function save(event: FormEvent) {
    event.preventDefault();
    const paise = Math.round(Number(price) * 100);
    if (!Number.isFinite(paise) || !Number.isSafeInteger(paise)) { setError('Enter a price that can be represented in paise.'); return; }
    try {
      const rate = taxCategory === 'taxable' ? /^(?:\d{1,3})(?:\.\d{1,2})?$/.test(gstRate) ? Math.round(Number(gstRate) * 100) : NaN : 0;
      if (!Number.isSafeInteger(rate) || rate < (taxCategory === 'taxable' ? 1 : 0) || rate > 100_000) { setError('Enter a positive tax rate from 0 to 1000 with up to two decimal places.'); return; }
      if (!unit.trim() || unit.trim().length > 24) { setError('Enter a unit between 1 and 24 characters.'); return; }
      await api.createProduct(organization.id, { code, name, unit: unit.trim(), unitPricePaise: paise,
        ...(hsnSacCode ? { hsnSacCode } : {}), taxCategory, ...(taxCategory === 'taxable' ? { gstRateBasisPoints: rate } : {}) });
      setCode(''); setName(''); setUnit('unit'); setPrice(''); setHsnSacCode(''); setTaxCategory('not_configured'); setGstRate(''); setVersion(value => value + 1); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save service.'); }
  }
  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const paise = Math.round(Number(editing.price) * 100);
    if (!Number.isFinite(paise) || !Number.isSafeInteger(paise) || paise < 0) { setError('Enter a price that can be represented in paise.'); return; }
    if (!editing.name.trim() || !editing.unit.trim() || editing.unit.trim().length > 24) { setError('Enter a service name and a unit between 1 and 24 characters.'); return; }
    const rate = editing.taxCategory === 'taxable' ? /^(?:\d{1,3})(?:\.\d{1,2})?$/.test(editing.gstRate) ? Math.round(Number(editing.gstRate) * 100) : NaN : undefined;
    if (editing.taxCategory === 'taxable' && (!Number.isSafeInteger(rate) || !rate || rate > 100_000)) { setError('Enter a positive tax rate from 0 to 1000 with up to two decimal places.'); return; }
    try {
      setSaving(true);
      await api.updateProduct(organization.id, editing.id, { name: editing.name.trim(), unit: editing.unit.trim(), unitPricePaise: paise,
        hsnSacCode: editing.hsnSacCode, taxCategory: editing.taxCategory, ...(rate !== undefined ? { gstRateBasisPoints: rate } : {}) });
      setEditing(null); setVersion(value => value + 1); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update service.'); }
    finally { setSaving(false); }
  }
  async function archiveProduct() {
    if (!archiving) return;
    setSaving(true);
    try {
      await api.updateProduct(organization.id, archiving._id, { active: false });
      setArchiving(null); setVersion(value => value + 1); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to archive service.'); }
    finally { setSaving(false); }
  }
  return <Stack spacing={2}>
    <Typography variant="h5">Products and services</Typography>
    <TextField label="Search services" value={query} onChange={event => setQuery(event.target.value)} />
    {canWrite && <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack component="form" spacing={2} onSubmit={event => { void save(event); }}>
        <Typography variant="h6">Add service</Typography>
        <TextField required label="Code" value={code} onChange={event => setCode(event.target.value)} />
        <TextField required label="Name" value={name} onChange={event => setName(event.target.value)} />
        <TextField required label="Unit" inputProps={{ maxLength: 24 }} helperText="Whole-number quantities only. For example: hour, item, or service. Stored on invoice lines." value={unit} onChange={event => setUnit(event.target.value)} />
        <TextField required label="Unit price (₹)" type="number" inputProps={{ min: 0, step: '0.01' }}
          value={price} onChange={event => setPrice(event.target.value)} />
        <TextField label="HSN/SAC code" inputProps={{ maxLength: 8, inputMode: 'numeric' }} helperText="Optional: enter 2, 4, 6, or 8 digits. Format only; verify the code and tax treatment separately."
          value={hsnSacCode} onChange={event => setHsnSacCode(event.target.value.replace(/\D/g, ''))} />
        <TextField select label="Tax category" value={taxCategory} onChange={event => setTaxCategory(event.target.value as typeof taxCategory)}>
          <MenuItem value="not_configured">Not configured</MenuItem><MenuItem value="taxable">Taxable</MenuItem>
          <MenuItem value="exempt">Exempt</MenuItem><MenuItem value="nil_rated">Nil rated</MenuItem><MenuItem value="non_gst">Outside GST scope</MenuItem>
        </TextField>
        {taxCategory === 'taxable' && <TextField required label="Configured total rate (%)" type="number" inputProps={{ min: 0, max: 1000, step: '0.01' }}
          helperText="User-entered only; Aslibooks does not verify rates or classification." value={gstRate} onChange={event => setGstRate(event.target.value)} />}
        <Button type="submit" variant="contained">Save service</Button>
      </Stack>
    </Paper>}
    {error && <Alert severity="error">{error}</Alert>}
    {!error && !products.length && <Typography>No matching products or services.</Typography>}
    {products.map(product => <Paper variant="outlined" sx={{ p: 2 }} key={product._id}>
      <Typography variant="h6">{product.code} · {product.name}</Typography>
      <Typography>₹{(product.unitPricePaise / 100).toFixed(2)} / {product.unit || 'unit'}</Typography>
      <Typography variant="body2" color="text.secondary">{product.hsnSacCode ? `HSN/SAC ${product.hsnSacCode} · ` : ''}{product.taxCategory.replaceAll('_', ' ')}{product.gstRateBasisPoints !== undefined ? ` · ${(product.gstRateBasisPoints / 100).toFixed(2)}% configured` : ''}</Typography>
      {canWrite && <Stack direction="row" spacing={1}>
        <Button onClick={() => setEditing({ id: product._id, name: product.name, unit: product.unit || 'unit', price: (product.unitPricePaise / 100).toFixed(2),
          hsnSacCode: product.hsnSacCode ?? '', taxCategory: product.taxCategory, gstRate: product.gstRateBasisPoints === undefined ? '' : (product.gstRateBasisPoints / 100).toFixed(2) })}>Edit service</Button>
        <Button color="error" onClick={() => setArchiving(product)}>Archive service</Button>
      </Stack>}
    </Paper>)}
    <Dialog open={!!editing} onClose={() => { if (!saving) setEditing(null); }} fullWidth maxWidth="sm">
      <DialogTitle>Edit service</DialogTitle>
      <DialogContent>
        {editing && <Stack component="form" id="edit-service-form" spacing={2} sx={{ pt: 1 }} onSubmit={event => { void saveEdit(event); }}>
          <TextField required label="Service name" value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} />
          <TextField required label="Unit" inputProps={{ maxLength: 24 }} value={editing.unit} onChange={event => setEditing({ ...editing, unit: event.target.value })} />
          <TextField required label="Unit price (₹)" type="number" inputProps={{ min: 0, step: '0.01' }} value={editing.price} onChange={event => setEditing({ ...editing, price: event.target.value })} />
          <TextField label="HSN/SAC code" inputProps={{ maxLength: 8, inputMode: 'numeric' }} helperText="Format only; verify the code and tax treatment separately."
            value={editing.hsnSacCode} onChange={event => setEditing({ ...editing, hsnSacCode: event.target.value.replace(/\D/g, '') })} />
          <TextField select label="Tax category" value={editing.taxCategory} onChange={event => setEditing({ ...editing, taxCategory: event.target.value as Product['taxCategory'], gstRate: event.target.value === 'taxable' ? editing.gstRate : '' })}>
            <MenuItem value="not_configured">Not configured</MenuItem><MenuItem value="taxable">Taxable</MenuItem>
            <MenuItem value="exempt">Exempt</MenuItem><MenuItem value="nil_rated">Nil rated</MenuItem><MenuItem value="non_gst">Outside GST scope</MenuItem>
          </TextField>
          {editing.taxCategory === 'taxable' && <TextField required label="Configured total rate (%)" type="number" inputProps={{ min: 0, max: 1000, step: '0.01' }}
            helperText="User-entered only; rates and classification are not verified." value={editing.gstRate} onChange={event => setEditing({ ...editing, gstRate: event.target.value })} />}
        </Stack>}
      </DialogContent>
      <DialogActions><Button disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button disabled={saving} type="submit" form="edit-service-form" variant="contained">Save service changes</Button></DialogActions>
    </Dialog>
    <Dialog open={!!archiving} onClose={() => { if (!saving) setArchiving(null); }}>
      <DialogTitle>Archive service?</DialogTitle>
      <DialogContent><DialogContentText>{archiving?.name} will be removed from the active catalog and unavailable for new invoices. Existing invoices retain their saved service details.</DialogContentText></DialogContent>
      <DialogActions><Button disabled={saving} onClick={() => setArchiving(null)}>Cancel</Button><Button color="error" disabled={saving} onClick={() => void archiveProduct()}>Confirm archive</Button></DialogActions>
    </Dialog>
  </Stack>;
}


