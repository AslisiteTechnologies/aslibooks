import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Box, Button, CircularProgress, Container, Link, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, userFacingApiError } from './api';

export function AuthScreen({ onAuthenticated, connectionError = '', onRetryConnection }: {
  onAuthenticated: () => Promise<void>;
  connectionError?: string;
  onRetryConnection?: () => void;
}) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'request-reset' | 'reset'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const previousMode = useRef(mode);
  const nameInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (previousMode.current === mode) return;
    previousMode.current = mode;
    const nextInput = mode === 'signup' ? nameInput : mode === 'reset' ? passwordInput : emailInput;
    nextInput.current?.focus();
  }, [mode]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (token) { setResetToken(token); setMode('reset'); }
    void api.authConfig().then(config => setVerificationRequired(config.emailVerificationRequired)).catch(() => setVerificationRequired(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setNotice('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        await api.signUp(name, email, password);
        if (verificationRequired) { setPassword(''); setNotice('Account created. Check your email and verify your address before signing in.'); return; }
        await onAuthenticated(); return;
      }
      if (mode === 'request-reset') {
        await api.requestPasswordReset(email);
        setNotice('If an account matches that address, a password reset link will arrive by email.'); return;
      }
      if (mode === 'reset') {
        await api.resetPassword(resetToken, password);
        window.history.replaceState({}, '', window.location.pathname);
        setResetToken(''); setPassword(''); setMode('signin'); setNotice('Password changed. Sign in with your new password.'); return;
      }
      await api.signIn(email, password);
      await onAuthenticated();
    } catch (cause) {
      setError(userFacingApiError(cause, 'Authentication failed'));
    } finally { setBusy(false); }
  }

  async function resendVerification() {
    if (!email) { setError('Enter your email address first.'); return; }
    setBusy(true); setError(''); setNotice('');
    try { await api.resendVerificationEmail(email); setNotice('If the account needs verification, a new link will arrive by email.'); }
    catch { setNotice('If the account needs verification, a new link will arrive by email.'); }
    finally { setBusy(false); }
  }

  return <Container maxWidth="sm" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', py: 5 }}>
    <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 }, width: '100%' }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={800}>Aslibooks</Typography>
          <Typography color="text.secondary">{mode === 'signin' ? 'Sign in to your workspace' : mode === 'signup' ? 'Create your account' : mode === 'request-reset' ? 'Request a password reset' : 'Choose a new password'}</Typography>
        </Box>
        {connectionError && <Alert severity="error" action={onRetryConnection && <Button color="inherit" size="small" onClick={onRetryConnection}>Retry</Button>}>{connectionError}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        <Stack component="form" spacing={2} onSubmit={(event) => { void submit(event); }}>
          {mode === 'signup' && <TextField inputRef={nameInput} label="Full name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}
          {mode !== 'reset' && <TextField inputRef={emailInput} label="Email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          {(mode === 'signin' || mode === 'signup' || mode === 'reset') && <TextField inputRef={passwordInput} label={mode === 'reset' ? 'New password' : 'Password'} type="password" required inputProps={{ minLength: 8 }} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />}
          <Button type="submit" variant="contained" size="large" disabled={busy || (mode === 'reset' && !resetToken)}>{busy ? <CircularProgress size={22} aria-label="Submitting account request" /> : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'request-reset' ? 'Send reset link' : 'Save new password'}</Button>
        </Stack>
        {mode === 'signin' && verificationRequired && <Link component="button" type="button" onClick={() => { setMode('request-reset'); setError(''); setNotice(''); }}>Forgot password?</Link>}
        {mode === 'signin' && verificationRequired && <Link component="button" type="button" disabled={busy} onClick={() => { void resendVerification(); }}>Resend verification email</Link>}
        {mode === 'signin' || mode === 'signup' ? <Typography variant="body2">
          {mode === 'signin' ? 'New to Aslibooks? ' : 'Already have an account? '}
          <Link component="button" type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setNotice(''); }}>{mode === 'signin' ? 'Create account' : 'Sign in'}</Link>
        </Typography> : <Link component="button" type="button" onClick={() => { setMode('signin'); setError(''); setNotice(''); setPassword(''); setResetToken(''); }}>Back to sign in</Link>}
      </Stack>
    </Paper>
  </Container>;
}
