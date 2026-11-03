import { useState, type FormEvent } from 'react';
import { Alert, Button, CircularProgress, Container, Paper, Stack, TextField, Typography } from '@mui/material';
import { api } from './api';

export function OnboardingScreen({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
        <Typography color="text.secondary">Create your first accounting workspace. Financial entries are not available yet.</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Business name" required value={name} onChange={(e) => {
          setName(e.target.value);
          setSlug(e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
        }} />
        <TextField label="Workspace slug" required helperText="Lowercase letters, numbers and hyphens; at least 3 characters" value={slug} onChange={(e) => setSlug(e.target.value)} inputProps={{ pattern: '[a-z0-9]+(-[a-z0-9]+)*', minLength: 3, maxLength: 64 }} />
        <Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? <CircularProgress size={22} /> : 'Create workspace'}</Button>
      </Stack>
    </Paper>
  </Container>;
}
