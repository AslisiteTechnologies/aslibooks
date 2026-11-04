import { useState } from 'react';
import { Button, Stack } from '@mui/material';
import { AccountsScreen } from './AccountsScreen';
import { JournalsScreen } from './JournalsScreen';
import type { Organization } from './api';

export function AccountingScreen({ organization }: { organization: Organization }) {
  const [view, setView] = useState<'accounts' | 'journals'>('accounts');
  return <Stack spacing={2}>
    <Stack direction="row" flexWrap="wrap" gap={1}>
      <Button variant={view === 'accounts' ? 'contained' : 'outlined'} onClick={() => setView('accounts')}>Chart of accounts</Button>
      <Button variant={view === 'journals' ? 'contained' : 'outlined'} onClick={() => setView('journals')}>Journals</Button>
    </Stack>
    {view === 'accounts' ? <AccountsScreen key={organization.id} organization={organization} />
      : <JournalsScreen key={organization.id} organization={organization} />}
  </Stack>;
}
