import { useEffect, useState } from 'react';
import { Alert, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { api, type FiscalCloseChecklist, type FiscalPeriod, type Organization } from './api';

export function FiscalPeriodsScreen({ organization }: { organization: Organization }) {
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [checklist, setChecklist] = useState<FiscalCloseChecklist | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = periods.find(period => period.id === selectedId) ?? periods[0];
  const canClose = ['owner', 'admin'].includes(organization.role);

  async function load(periodId?: string) {
    setError('');
    const result = await api.fiscalPeriods(organization.id);
    setPeriods(result.periods);
    const nextId = periodId && result.periods.some(period => period.id === periodId) ? periodId : (result.periods.find(period => period.status === 'open') ?? result.periods[0])?.id ?? '';
    setSelectedId(nextId);
    if (nextId) setChecklist((await api.fiscalCloseChecklist(organization.id, nextId)).checklist);
    else setChecklist(null);
  }

  useEffect(() => { void load().catch(cause => setError(cause instanceof Error ? cause.message : 'Fiscal periods could not be loaded.')); }, [organization.id]);

  async function closePeriod() {
    if (!selected || !checklist?.canClose || !canClose) return;
    if (!window.confirm(`Close ${selected.startDate} through the day before ${selected.endDateExclusive}? New journal posting in this period will be blocked.`)) return;
    setBusy(true); setError('');
    try { await api.closeFiscalPeriod(organization.id, selected.id); await load(selected.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The period could not be closed.'); try { await load(selected.id); } catch { /* Keep the original close error visible. */ } }
    finally { setBusy(false); }
  }

  return <Stack spacing={2}>
    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1}>
      <Stack><Typography variant="h5" fontWeight={750}>Fiscal period close</Typography><Typography color="text.secondary">Review ledger and imported bank activity before locking journal posting.</Typography></Stack>
      {selected && <Chip label={selected.status === 'open' ? 'Open' : 'Closed'} color={selected.status === 'open' ? 'success' : 'default'} />}
    </Stack>
    {error && <Alert severity="error">{error}</Alert>}
    {periods.length > 1 && <Paper variant="outlined" sx={{ p: 1.5 }}><Stack direction="row" spacing={1} flexWrap="wrap">{periods.map(period => <Button key={period.id} variant={period.id === selected?.id ? 'contained' : 'outlined'} onClick={() => { setSelectedId(period.id); void api.fiscalCloseChecklist(organization.id, period.id).then(result => setChecklist(result.checklist)).catch(cause => setError(cause instanceof Error ? cause.message : 'Checklist could not be loaded.')); }}>{period.startDate} – {period.endDateExclusive} (exclusive)</Button>)}</Stack></Paper>}
    {!selected && <Alert severity="info">A fiscal period is created when the first journal is posted.</Alert>}
    {selected && <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={2}>
      <Typography variant="h6">Close review</Typography><Typography color="text.secondary">Period {selected.startDate} to {selected.endDateExclusive} (end date is exclusive)</Typography>
      {!checklist ? <CircularProgress size={24} /> : checklist.checks.map(check => <Stack key={check.id} direction="row" spacing={1} alignItems="flex-start">
        <Chip size="small" color={check.passed ? 'success' : check.blocking ? 'error' : 'warning'} label={check.passed ? 'Ready' : check.blocking ? 'Blocked' : 'Review'} />
        <Stack><Typography fontWeight={600}>{check.label}</Typography><Typography variant="body2" color="text.secondary">{check.detail}{!check.blocking && !check.passed ? ' This is a reminder; it does not prevent closing.' : ''}</Typography></Stack>
      </Stack>)}
      {selected.status === 'open' && canClose && <Button variant="contained" color="warning" disabled={!checklist?.canClose || busy} onClick={() => void closePeriod()}>{busy ? 'Closing…' : 'Review and close period'}</Button>}
      {selected.status === 'open' && !canClose && <Alert severity="info">Only an owner or admin can close a fiscal period.</Alert>}
    </Stack></Paper>}
  </Stack>;
}
