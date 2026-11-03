import { useState, type FormEvent } from 'react';
import { Alert, Box, Button, CircularProgress, Container, Link, Paper, Stack, TextField, Typography } from '@mui/material';
import { api } from './api';

export function AuthScreen({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') await api.signUp(name, email, password);
      else await api.signIn(email, password);
      await onAuthenticated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication failed');
    } finally { setBusy(false); }
  }

  return <Container maxWidth="sm" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', py: 5 }}>
    <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 }, width: '100%' }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={800}>Aslibooks</Typography>
          <Typography color="text.secondary">{mode === 'signin' ? 'Sign in to your workspace' : 'Create your account'}</Typography>
        </Box>
        {error && <Alert severity="error">{error}</Alert>}
        <Stack component="form" spacing={2} onSubmit={(event) => { void submit(event); }}>
          {mode === 'signup' && <TextField label="Full name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}
          <TextField label="Email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField label="Password" type="password" required inputProps={{ minLength: 8 }} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? <CircularProgress size={22} /> : mode === 'signin' ? 'Sign in' : 'Create account'}</Button>
        </Stack>
        <Typography variant="body2">
          {mode === 'signin' ? 'New to Aslibooks? ' : 'Already have an account? '}
          <Link component="button" type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}>{mode === 'signin' ? 'Create account' : 'Sign in'}</Link>
        </Typography>
      </Stack>
    </Paper>
  </Container>;
}
