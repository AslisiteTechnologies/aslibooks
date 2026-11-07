import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, CircularProgress, Container, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, type OrganizationInvitation } from './api';

export function OnboardingScreen({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  useEffect(() => { void api.invitations().then(result => setInvitations(result.invitations)).catch(() => setInvitations([])); }, []);
  async function accept(invitation: OrganizationInvitation) {
    setBusy(true); setError('');
    try { await api.acceptInvitation(invitation.organizationId, invitation.id); await onCreated(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Invitation could not be accepted.'); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.createOrganization(name, slug);
      await onCreated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create company'); }
    finally { setBusy(false); }
  }

  return <Container maxWidth="sm" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', py: 5 }}>
    <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 }, width: '100%' }}>
      <Stack component="form" spacing={3} onSubmit={(event) => { void submit(event); }}>
        <Typography variant="h4" fontWeight={800}>Set up your company</Typography>
        <Typography color="text.secondary">Create a workspace or accept an invitation to join your team.</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {invitations.map(invitation => <Paper variant="outlined" sx={{ p: 2 }} key={invitation.id}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between">
            <Typography>{invitation.organizationName} invited you as {invitation.role}.</Typography>
            <Button variant="outlined" disabled={busy} onClick={() => void accept(invitation)}>Accept invitation</Button>
          </Stack>
        </Paper>)}
        <TextField label="Business name" required value={name} onChange={(e) => {
          setName(e.target.value);
          setSlug(e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
        }} />
        <TextField label="Workspace slug" required helperText="Lowercase letters, numbers and hyphens; at least 3 characters" value={slug} onChange={(e) => setSlug(e.target.value)} inputProps={{ pattern: '[a-z0-9]+(-[a-z0-9]+)*', minLength: 3, maxLength: 64 }} />
        <Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? <CircularProgress size={22} aria-label="Creating workspace" /> : 'Create workspace'}</Button>
      </Stack>
    </Paper>
  </Container>;
}

