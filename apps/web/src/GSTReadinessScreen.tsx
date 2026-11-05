import { useEffect, useState } from 'react';
import { Alert, Chip, Paper, Stack, Typography } from '@mui/material';
import { api, type Organization, type Product } from './api';
import { getGstSetupIssues } from './gstReadiness';

function formatRate(rateBasisPoints?: number) {
  return rateBasisPoints === undefined ? 'Not entered' : `${(rateBasisPoints / 100).toFixed(2)}% (user entered)`;
}

export function GSTReadinessScreen({ organization }: { organization: Organization }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void api.products(organization.id).then(result => { if (active) { setProducts(result.products); setError(''); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'GST setup data could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organization.id]);

  return <Stack spacing={2}>
    <Stack><Typography variant="h5" fontWeight={750}>GST setup review</Typography><Typography color="text.secondary">Review user-entered product tax fields before asking a qualified professional to verify them.</Typography></Stack>
    <Alert severity="warning">Aslibooks does not verify GST rates, HSN/SAC codes, tax treatment, or filing eligibility. This screen does not certify GST compliance. Tax-bearing invoice issue remains disabled pending professional review.</Alert>
    {error && <Alert severity="error">{error}</Alert>}
    {!loading && !!products.length && <Alert severity="info">This review checks whether catalog fields were entered. It does not validate rates, codes, applicability, or filing treatment.</Alert>}
    {loading ? <Typography role="status">Loading tax setup…</Typography> : !products.length ? <Paper variant="outlined" sx={{ p: 2 }}><Typography color="text.secondary">Add products or services with their HSN/SAC and tax fields to review them here.</Typography></Paper> : products.map(product => {
      const issues = getGstSetupIssues(product);
      return <Paper variant="outlined" sx={{ p: 2 }} key={product._id}><Stack spacing={1}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1}><Typography fontWeight={700}>{product.code} · {product.name}</Typography><Stack direction="row" spacing={1}><Chip size="small" color={product.taxCategory === 'not_configured' ? 'warning' : 'default'} label={product.taxCategory.replaceAll('_', ' ')} /><Chip size="small" color={issues.length ? 'warning' : 'success'} label={issues.length ? 'Input incomplete' : 'Data entered'} /></Stack></Stack>
      <Typography variant="body2">HSN/SAC: {product.hsnSacCode || 'Not entered'}</Typography>
      <Typography variant="body2">Rate: {formatRate(product.gstRateBasisPoints)}</Typography>
      {issues.length > 0 && <Typography variant="body2" color="warning.dark">Review: {issues.join(' · ')}</Typography>}
    </Stack></Paper>;
    })}
  </Stack>;
}
