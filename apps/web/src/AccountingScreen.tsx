import { useState } from 'react';
import { Button, Stack } from '@mui/material';
import { AccountsScreen } from './AccountsScreen';
import { JournalsScreen } from './JournalsScreen';
import type { Organization } from './api';
import { OpeningBalancesScreen } from './OpeningBalancesScreen';

export function AccountingScreen({ organization }: { organization: Organization }) {
  const [view, setView] = useState<'accounts' | 'journals' | 'opening'>('accounts');
  return <Stack spacing={2}>
    <Stack direction="row" flexWrap="wrap" gap={1}>
      <Button variant={view === 'accounts' ? 'contained' : 'outlined'} onClick={() => setView('accounts')}>Chart of accounts</Button>
      <Button variant={view === 'journals' ? 'contained' : 'outlined'} onClick={() => setView('journals')}>Journals</Button>
      <Button variant={view === 'opening' ? 'contained' : 'outlined'} onClick={() => setView('opening')}>Opening balances</Button>
    </Stack>
    {view === 'accounts' ? <AccountsScreen key={organization.id} organization={organization} />
      : view === 'journals' ? <JournalsScreen key={organization.id} organization={organization} />
      : <OpeningBalancesScreen key={organization.id} organization={organization} />}
  </Stack>;
}
