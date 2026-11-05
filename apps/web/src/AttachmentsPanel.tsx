import { useEffect, useState } from 'react';
import { Alert, Button, Paper, Stack, Typography } from '@mui/material';
import { api, type Attachment } from './api';

type ResourceType = Attachment['resourceType'];
const accept = 'application/pdf,image/png,image/jpeg';
const formatBytes = (size: number) => size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;

export function AttachmentsPanel({ organizationId, resourceType, resourceId, canWrite }: { organizationId: string; resourceType: ResourceType; resourceId: string; canWrite: boolean }) {
  const [open, setOpen] = useState(false); const [rows, setRows] = useState<Attachment[]>([]); const [file, setFile] = useState<File | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(''); const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!open) return;
    let active = true; setLoading(true); setError('');
    api.attachments(organizationId, resourceType, resourceId).then(result => { if (active) setRows(result.attachments); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Attachments could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, organizationId, resourceId, resourceType]);

  async function upload() {
    if (!file) return;
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError('Choose a PDF, PNG or JPEG file up to 10 MB.'); return;
    }
    const key = idempotencyKey || `attachment:${crypto.randomUUID()}`; setIdempotencyKey(key); setSaving(true); setError(''); setNotice('');
    try {
      await api.uploadAttachment(organizationId, resourceType, resourceId, file, key);
      setNotice(`${file.name} uploaded privately.`); setFile(null); setIdempotencyKey('');
      const refreshed = await api.attachments(organizationId, resourceType, resourceId); setRows(refreshed.attachments);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Attachment could not be uploaded.'); }
    finally { setSaving(false); }
  }

  async function download(attachment: Attachment) {
    setError('');
    try {
      const blob = await api.downloadAttachment(organizationId, attachment.id); const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = attachment.filename; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Attachment could not be downloaded.'); }
  }

  return <Stack spacing={1} sx={{ mt: 1 }}>
    <Button size="small" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Hide attachments' : 'Attachments'}</Button>
    {open && <Paper variant="outlined" sx={{ p: 1.5 }}><Stack spacing={1}>
      <Typography variant="subtitle2">Private source documents · PDF, PNG or JPEG · 10 MB maximum</Typography>
      {loading ? <Typography role="status">Loading attachments…</Typography> : !rows.length && <Typography color="text.secondary">No attachments yet.</Typography>}
      {rows.map(row => <Stack key={row.id} direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Typography variant="body2">{row.filename} · {formatBytes(row.sizeBytes)}</Typography>
        <Button size="small" onClick={() => void download(row)}>Download</Button>
      </Stack>)}
      {canWrite && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button component="label" variant="outlined" disabled={saving}>Choose file<input hidden type="file" accept={accept} onChange={event => { setFile(event.target.files?.[0] ?? null); setIdempotencyKey(''); setError(''); }} /></Button>
        <Typography sx={{ alignSelf: 'center' }} variant="body2">{file?.name ?? 'No file selected'}</Typography>
        <Button variant="contained" disabled={saving || !file} onClick={() => void upload()}>{saving ? 'Uploading…' : 'Upload privately'}</Button>
      </Stack>}
      {error && <Alert severity="error">{error}</Alert>}{notice && <Typography role="status">{notice}</Typography>}
    </Stack></Paper>}
  </Stack>;
}
