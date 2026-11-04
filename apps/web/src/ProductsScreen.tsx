import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, type Organization, type Product } from './api';

export function ProductsScreen({ organization }: { organization: Organization }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
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
      await api.createProduct(organization.id, { code, name, unitPricePaise: paise });
      setCode(''); setName(''); setPrice(''); setVersion(value => value + 1); setError('');
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
        <Button type="submit" variant="contained">Save service</Button>
      </Stack>
    </Paper>}
    {error && <Alert severity="error">{error}</Alert>}
    {!error && !products.length && <Typography>No matching products or services.</Typography>}
    {products.map(product => <Paper variant="outlined" sx={{ p: 2 }} key={product._id}>
      <Typography variant="h6">{product.code} · {product.name}</Typography>
      <Typography>₹{(product.unitPricePaise / 100).toFixed(2)}</Typography>
    </Paper>)}
  </Stack>;
}
