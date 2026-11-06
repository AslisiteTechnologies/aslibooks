import { lazy, Suspense, useEffect, useState } from 'react';
import { api, type Organization } from './api';
import { AuthScreen } from './AuthScreen';
import { OnboardingScreen } from './OnboardingScreen';
import { AppBar, Box, Button, Chip, Container, Divider, Drawer, List, ListItemButton, ListItemText, Paper, Stack, Toolbar, Typography } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';

const AccountingScreen = lazy(() => import('./AccountingScreen').then(module => ({ default: module.AccountingScreen })));
const ContactsScreen = lazy(() => import('./ContactsScreen').then(module => ({ default: module.ContactsScreen })));
const ProductsScreen = lazy(() => import('./ProductsScreen').then(module => ({ default: module.ProductsScreen })));
const SalesScreen = lazy(() => import('./SalesScreen').then(module => ({ default: module.SalesScreen })));
const ReceiptsScreen = lazy(() => import('./ReceiptsScreen').then(module => ({ default: module.ReceiptsScreen })));
const ExpensesScreen = lazy(() => import('./ExpensesScreen').then(module => ({ default: module.ExpensesScreen })));
const ReportsScreen = lazy(() => import('./ReportsScreen').then(module => ({ default: module.ReportsScreen })));
const BankingScreen = lazy(() => import('./BankingScreen').then(module => ({ default: module.BankingScreen })));
const DashboardScreen = lazy(() => import('./DashboardScreen').then(module => ({ default: module.DashboardScreen })));
const TeamScreen = lazy(() => import('./TeamScreen').then(module => ({ default: module.TeamScreen })));
const SettingsScreen = lazy(() => import('./SettingsScreen').then(module => ({ default: module.SettingsScreen })));
const FiscalPeriodsScreen = lazy(() => import('./FiscalPeriodsScreen').then(module => ({ default: module.FiscalPeriodsScreen })));
const GSTReadinessScreen = lazy(() => import('./GSTReadinessScreen').then(module => ({ default: module.GSTReadinessScreen })));

const nav = ['Overview', 'Sales', 'Receipts', 'Products', 'Expenses', 'Banking', 'Contacts', 'Team', 'Accounting', 'GST', 'Reports', 'Period close', 'Settings'];
const drawerWidth = 248;

export function App() {
  const [section, setSection] = useState('Overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authState, setAuthState] = useState<'loading' | 'signed-out' | 'onboarding' | 'ready'>('loading');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const organization = organizations.find(org => org.id === selectedId) ?? organizations[0];
  const [authError, setAuthError] = useState('');

  async function refreshSession() {
    try {
      const session = await api.session();
      if (!session?.user) { setOrganizations([]); setAuthState('signed-out'); return; }
      const items = await api.organizations();
      setOrganizations(items);
      setAuthState(items.length ? 'ready' : 'onboarding');
      setAuthError('');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Cannot reach API');
      setAuthState('signed-out');
    }
  }

  useEffect(() => { void refreshSession(); }, []);

  useEffect(() => {
    function handleSessionExpired() {
      setOrganizations([]);
      setSelectedId('');
      setAuthError('Your session expired. Sign in again to continue.');
      setAuthState('signed-out');
    }
    window.addEventListener('aslibooks:session-expired', handleSessionExpired);
    return () => window.removeEventListener('aslibooks:session-expired', handleSessionExpired);
  }, []);

  if (authState === 'loading') return <Box sx={{ p: 5 }} role="status">Loading Aslibooks…</Box>;
  if (authState === 'signed-out') return <><AuthScreen onAuthenticated={refreshSession} />{authError && <Box role="alert" sx={{ p: 2 }}>{authError}</Box>}</>;
  if (authState === 'onboarding') return <OnboardingScreen onCreated={refreshSession} />;
  const sidebar = (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 1, py: 2 }}>
        <AccountBalanceWalletOutlinedIcon color="primary" />
        <Typography variant="h6" fontWeight={800}>Aslibooks</Typography>
      </Stack>
      <Divider sx={{ my: 2 }} />
      <List>
        {nav.map((item) => (
          <ListItemButton key={item} selected={section === item} aria-current={section === item ? 'page' : undefined}
            onClick={() => { setSection(item); setMobileOpen(false); }} sx={{ borderRadius: 2, mb: 0.5 }}>
            <ListItemText primary={item} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" color="inherit" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider', ml: { md: `${drawerWidth}px` }, width: { md: `calc(100% - ${drawerWidth}px)` } }}>
        <Toolbar>
          <Button sx={{ display: { md: 'none' }, minWidth: 40, mr: 1 }} aria-label="Open navigation"
            aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><MenuIcon /></Button>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            {organizations.length > 1 ? <select aria-label="Active organization" value={organization.id}
              onChange={e => setSelectedId(e.target.value)}>{organizations.map(org =>
                <option key={org.id} value={org.id}>{org.name}</option>)}</select> : <Typography fontWeight={700}>{organization.name}</Typography>}
          </Box>
          <Button size="small" onClick={() => { void api.signOut().then(refreshSession).catch(() => setAuthError("Sign out failed")); }}>Sign out</Button>
          <Chip label="Development preview" variant="outlined" size="small" />
        </Toolbar>
      </AppBar>
      <Box component="nav" aria-label="Primary navigation" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }} sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: drawerWidth } }}>{sidebar}</Drawer>
        <Drawer variant="permanent" open sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: drawerWidth, borderRightColor: 'divider' } }}>{sidebar}</Drawer>
      </Box>
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, pt: 12, pb: 6 }}>
        <Container maxWidth="lg">
          <Typography variant="h4" fontWeight={800} gutterBottom>{section}</Typography>
          {authError && <Box role="alert">{authError}</Box>}
          <Suspense fallback={<Box role="status" sx={{ py: 4 }}>Loading {section.toLowerCase()}…</Box>}>
          {section === 'Overview' ? <DashboardScreen key={organization.id} organization={organization} /> :
          section === 'Accounting' ? <AccountingScreen key={organization.id} organization={organization} /> :
          section === 'Contacts' ? <ContactsScreen key={organization.id} organization={organization} /> :
          section === 'Sales' ? <SalesScreen key={organization.id} organization={organization} /> :
          section === 'Receipts' ? <ReceiptsScreen key={organization.id} organization={organization} /> :
          section === 'Expenses' ? <ExpensesScreen key={organization.id} organization={organization} /> :
          section === 'Products' ? <ProductsScreen key={organization.id} organization={organization} /> :
          section === 'Reports' ? <ReportsScreen key={organization.id} organization={organization} /> :
          section === 'Banking' ? <BankingScreen key={organization.id} organization={organization} /> :
          section === 'Team' ? <TeamScreen key={organization.id} organization={organization} onAccepted={refreshSession} /> :
          section === 'GST' ? <GSTReadinessScreen key={organization.id} organization={organization} /> :
          section === 'Period close' ? <FiscalPeriodsScreen key={organization.id} organization={organization} /> :
          section === 'Settings' ? <SettingsScreen key={organization.id} organization={organization} onSaved={() => { void refreshSession(); }} /> :
          <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 } }}>
            <Stack spacing={2} alignItems="flex-start">
              <Chip label="Not connected" color="warning" size="small" />
              <Typography variant="h6">Your accounting workspace is being built.</Typography>
              <Typography color="text.secondary">Open Accounting to manage your chart of accounts.</Typography>
            </Stack>
          </Paper>}
          </Suspense>
        </Container>
      </Box>
    </Box>
  );
}

