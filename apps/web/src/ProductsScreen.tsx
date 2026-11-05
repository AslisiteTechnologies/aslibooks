import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, type Organization, type Product } from './api';

export function ProductsScreen({ organization }: { organization: Organization }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [hsnSacCode, setHsnSacCode] = useState('');
  const [taxCategory, setTaxCategory] = useState<'not_configured' | 'taxable' | 'exempt' | 'nil_rated' | 'non_gst'>('not_configured');
  const [gstRate, setGstRate] = useState('');
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
      await api.createProduct(organization.id, { code, name, unitPricePaise: paise,
        ...(hsnSacCode ? { hsnSacCode } : {}), taxCategory, ...(taxCategory === 'taxable' ? { gstRateBasisPoints: rate } : {}) });
      setCode(''); setName(''); setPrice(''); setHsnSacCode(''); setTaxCategory('not_configured'); setGstRate(''); setVersion(value => value + 1); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save service.'); }
  }
  return <Stack spacing={2}>
    <Typography variant="h5">Products and services</Typography>
    <TextField label="Search services" value={query} onChange={event => setQuery(event.target.value)} />
    {canWrite && <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack component="form" spacing={2} onSubmit={event => { void save(event); }}>
        <Typography variant="h6">Add service</Typography>
        <TextField required label="Code" value={code} onChange={event => setCode(event.target.value)} />
        <TextField required label="Name" value={name} onChange={event => setName(event.target.value)} />
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
      <Typography>₹{(product.unitPricePaise / 100).toFixed(2)}</Typography>
      <Typography variant="body2" color="text.secondary">{product.hsnSacCode ? `HSN/SAC ${product.hsnSacCode} · ` : ''}{product.taxCategory.replaceAll('_', ' ')}{product.gstRateBasisPoints !== undefined ? ` · ${(product.gstRateBasisPoints / 100).toFixed(2)}% configured` : ''}</Typography>
    </Paper>)}
  </Stack>;
}

