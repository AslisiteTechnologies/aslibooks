import { useState, type FormEvent } from 'react';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, downloadOrganizationData, userFacingApiError, type Organization } from './api';

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function SettingsScreen({ organization, onSaved }: { organization: Organization; onSaved: () => void }) {
  const [name, setName] = useState(organization.name); const [gstin, setGstin] = useState(organization.gstin || '');
  const [month, setMonth] = useState(organization.fiscalYearStartMonth || 4); const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const canManage = ['owner', 'admin'].includes(organization.role);
  const canExport = ['owner', 'admin', 'accountant'].includes(organization.role);
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try { await api.updateOrganizationSettings(organization.id, { name, gstin, fiscalYearStartMonth: month }); setNotice('Organization settings saved.'); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Settings could not be saved.'); }
    finally { setSaving(false); }
  }
  async function exportRecords() {
    setExporting(true); setError(''); setNotice('');
    try {
      const { blob, filename } = await downloadOrganizationData(organization.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = filename; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Organization records export downloaded. Original attachment files are not included.');
    } catch (cause) { setError(userFacingApiError(cause, 'Organization data export could not be prepared.')); }
    finally { setExporting(false); }
  }
  return <Stack spacing={2}>
    <Typography variant="h5">Organization settings</Typography>
    {!canManage && <Alert severity="info">Only owners and admins can change organization settings.</Alert>}
    {error && <Alert severity="error">{error}</Alert>}{notice && <Typography role="status">{notice}</Typography>}
    <Paper variant="outlined" sx={{ p: 2 }}><Stack component="form" spacing={2} onSubmit={event => { void submit(event); }}>
      <Typography variant="h6">Company profile</Typography>
      <TextField label="Business name" required value={name} onChange={event => setName(event.target.value)} disabled={!canManage || saving} inputProps={{ maxLength: 160 }} />
      <TextField label="GSTIN (optional)" value={gstin} onChange={event => setGstin(event.target.value.toUpperCase())} disabled={!canManage || saving} inputProps={{ maxLength: 15 }} helperText="Format validation only. This does not verify registration or GST compliance." />
      <TextField select label="Fiscal year starts in" value={month} onChange={event => setMonth(Number(event.target.value))} disabled={!canManage || saving}>
        {months.map((label, index) => <MenuItem key={label} value={index + 1}>{label}</MenuItem>)}
      </TextField>
      <Typography color="text.secondary">Changing the fiscal-year start is available only before accounting journals or fiscal periods exist. Base currency is INR.</Typography>
      {canManage && <Button type="submit" variant="contained" disabled={saving}>Save settings</Button>}
    </Stack></Paper>
    <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={1}>
      <Typography variant="h6">Organization data export</Typography>
      <Typography color="text.secondary">Download tenant-scoped accounting source records and audit history as NDJSON. Export access is limited to owners, admins and accountants. Attachment metadata is included, but original file contents must be downloaded separately from their source records.</Typography>
      {canExport && <Button variant="outlined" onClick={() => { void exportRecords(); }} disabled={exporting}>{exporting ? 'Preparing export…' : 'Download organization records'}</Button>}
      {!canExport && <Alert severity="info">Only owners, admins and accountants can export organization records.</Alert>}
    </Stack></Paper>
  </Stack>;
}
