import { useEffect, useState } from 'react';
import { Alert, Box, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { api, type DashboardResult, type Organization } from './api';

function todayIndia() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`;
}
function formatMoney(value: number) {
  const abs = Math.abs(value); return `${value < 0 ? '−' : ''}₹${Math.floor(abs / 100).toLocaleString('en-IN')}.${String(abs % 100).padStart(2, '0')}`;
}

export function DashboardScreen({ organization }: { organization: Organization }) {
  const today = todayIndia(); const [from, setFrom] = useState(`${today.slice(0, 7)}-01`); const [to, setTo] = useState(today);
  const [data, setData] = useState<DashboardResult | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => {
    let current = true; setLoading(true); setError('');
    void api.dashboard(organization.id, from, to).then(result => { if (current) setData(result); })
      .catch(cause => { if (current) setError(cause instanceof Error ? cause.message : 'Dashboard data could not be loaded.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [organization.id, from, to]);
  const metrics = data ? [
    ['Revenue', data.revenuePaise], ['Expenses', data.expensesPaise], ['Net profit', data.netProfitPaise],
    ['Cash and bank', data.cashPaise], ['Receivables', data.receivablesPaise], ['Payables', data.payablesPaise],
  ] as const : [];
  return <Stack spacing={3}>
    {error && <Alert severity="error">{error}</Alert>}
    <Paper variant="outlined" sx={{ p: 2 }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <TextField type="date" label="From" value={from} onChange={event => setFrom(event.target.value)} InputLabelProps={{ shrink: true }} />
      <TextField type="date" label="Through" value={to} onChange={event => setTo(event.target.value)} InputLabelProps={{ shrink: true }} />
    </Stack></Paper>
    {loading ? <Box role="status" sx={{ py: 4 }}>Loading ledger summary…</Box> : data && <>
      <Typography variant="body2" color="text.secondary">Ledger-derived values · activity {data.from} through {data.to}; cash, receivables and payables are balances at the end date.</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 2 }}>
        {metrics.map(([label, value]) => <Paper variant="outlined" key={label} sx={{ p: 2.5 }}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h5" fontWeight={750} sx={{ mt: 1 }}>{formatMoney(value)}</Typography></Paper>)}
      </Box>
      <Paper variant="outlined" sx={{ p: 2, overflowX: 'auto' }}><Typography variant="h6" sx={{ mb: 1 }}>Recent ledger activity</Typography>
        {!data.recentActivity.length ? <Typography color="text.secondary">No posted journals in this date range.</Typography> : <Table size="small"><TableHead><TableRow><TableCell>Date</TableCell><TableCell>Description</TableCell><TableCell align="right">Lines</TableCell></TableRow></TableHead><TableBody>{data.recentActivity.map(item => <TableRow key={item.id}><TableCell>{new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }).format(new Date(item.postedAt))}</TableCell><TableCell>{item.description}</TableCell><TableCell align="right">{item.lineCount}</TableCell></TableRow>)}</TableBody></Table>}
      </Paper>
    </>}
  </Stack>;
}
