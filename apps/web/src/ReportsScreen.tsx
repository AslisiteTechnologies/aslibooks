import { useEffect, useState } from 'react';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, type Account, type BalanceSheetResult, type GeneralLedgerResult, type Organization, type ProfitAndLossResult, type TrialBalanceRow } from './api';

function todayInIndia() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function money(paise: number) {
  const absolute = Math.abs(paise);
  return `${paise < 0 ? '−' : ''}₹${Math.floor(absolute / 100).toLocaleString('en-IN')}.${String(absolute % 100).padStart(2, '0')}`;
}

export function ReportsScreen({ organization }: { organization: Organization }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);
  const [profitLoss, setProfitLoss] = useState<ProfitAndLossResult | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetResult | null>(null);
  const [trialTotals, setTrialTotals] = useState({ debit: 0, credit: 0, balanced: true });
  const [asOf, setAsOf] = useState(todayInIndia());
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(todayInIndia());
  const [ledger, setLedger] = useState<GeneralLedgerResult | null>(null);
  const [ledgerNext, setLedgerNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    async function load() {
      setLoading(true); setError('');
      try {
        const [firstPage, trial, pnl, balance] = await Promise.all([
          api.accounts(organization.id), api.trialBalance(organization.id, asOf),
          api.profitAndLoss(organization.id, asOf), api.balanceSheet(organization.id, asOf),
        ]);
        const all = [...firstPage.accounts];
        let cursor = firstPage.next;
        while (cursor) { const page = await api.accounts(organization.id, cursor); all.push(...page.accounts); cursor = page.next; }
        if (current) {
          setAccounts(all);
          const defaultAccount = all.find(account => account.active)?.id ?? all[0]?.id ?? '';
          setAccountId(id => all.some(account => account.id === id && account.active) ? id : defaultAccount);
          setTrialBalance(trial.accounts);
          setTrialTotals({ debit: trial.debitTotalPaise, credit: trial.creditTotalPaise, balanced: trial.balanced });
          setProfitLoss(pnl);
          setBalanceSheet(balance);
        }
      } catch (cause) { if (current) setError(cause instanceof Error ? cause.message : 'Reports could not be loaded.'); }
      finally { if (current) setLoading(false); }
    }
    void load();
    return () => { current = false; };
  }, [organization.id, asOf]);

  async function loadLedger(after = '') {
    if (!accountId) return;
    setError('');
    try {
      const page = await api.generalLedger(organization.id, accountId, from, to, after);
      if (!after) setLedger(page); else if (ledger) setLedger({ ...ledger, entries: [...ledger.entries, ...page.entries] });
      setLedgerNext(page.next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'General ledger could not be loaded.'); }
  }

  return <Stack spacing={2}>
    <Typography variant="h5">Reports</Typography>
    {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={2}>
        <Typography variant="h6">Trial balance</Typography>
        <Typography color="text.secondary">Posted journal balances through the selected India-local date.</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <TextField type="date" label="As of" value={asOf} onChange={event => setAsOf(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <Typography>Total debits {money(trialTotals.debit)} · Total credits {money(trialTotals.credit)}</Typography>
          <Typography color={trialTotals.balanced ? 'success.main' : 'error.main'}>{trialTotals.balanced ? 'Balanced' : 'Out of balance'}</Typography>
        </Stack>
        {loading ? <Typography role="status">Loading trial balance…</Typography> : trialBalance.length === 0 ? <Typography>No posted balances through this date.</Typography>
          : <Stack spacing={1}>
            {trialBalance.map(row => <Stack key={row.accountId} component={Paper} variant="outlined" direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" sx={{ p: 1.5 }}>
              <Typography>{row.code} · {row.name}</Typography>
              <Typography>Debit {money(row.debitBalancePaise)} · Credit {money(row.creditBalancePaise)}</Typography>
            </Stack>)}
          </Stack>}
      </Stack>
    </Paper>
    {profitLoss && <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={1.5}>
        <Typography variant="h6">Profit and loss</Typography>
        <Typography color="text.secondary">{profitLoss.from} through {profitLoss.to} · current fiscal year</Typography>
        {profitLoss.accounts.map(row => <Stack key={row.accountId} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between">
          <Typography>{row.code} · {row.name} · {row.type}</Typography><Typography>{money(row.balancePaise)}</Typography>
        </Stack>)}
        <Typography>Total income {money(profitLoss.totalIncomePaise)} · Expenses {money(profitLoss.totalExpensesPaise)} · Net profit {money(profitLoss.netProfitPaise)}</Typography>
      </Stack>
    </Paper>}
    {balanceSheet && <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={1.5}>
        <Typography variant="h6">Balance sheet</Typography>
        <Typography color="text.secondary">As of {balanceSheet.asOf}; current year earnings are included in equity.</Typography>
        {balanceSheet.accounts.map(row => <Stack key={row.accountId} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between">
          <Typography>{row.code} · {row.name} · {row.type}</Typography><Typography>{money(row.balancePaise)}</Typography>
        </Stack>)}
        <Typography>Assets {money(balanceSheet.totalAssetsPaise)} · Liabilities {money(balanceSheet.totalLiabilitiesPaise)} · Equity {money(balanceSheet.totalEquityPaise)} · Current earnings {money(balanceSheet.currentEarningsPaise)}</Typography>
        <Typography color={balanceSheet.balanced ? 'success.main' : 'error.main'}>{balanceSheet.balanced ? 'Balance sheet balances' : 'Balance sheet out of balance'}</Typography>
      </Stack>
    </Paper>}
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={2}>
        <Typography variant="h6">General ledger</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField select label="Account" value={accountId} onChange={event => { setAccountId(event.target.value); setLedger(null); }} sx={{ flex: 2 }}>
            {accounts.map(account => <MenuItem key={account.id} value={account.id}>{account.code} · {account.name}</MenuItem>)}
          </TextField>
          <TextField type="date" label="From" value={from} onChange={event => setFrom(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField type="date" label="Through" value={to} onChange={event => setTo(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <Button variant="contained" disabled={!accountId} onClick={() => void loadLedger()}>Load ledger</Button>
        </Stack>
        {ledger && <>
          <Typography>{ledger.account.code} · {ledger.account.name} · opening normal balance {money(ledger.openingBalancePaise)}</Typography>
          {!ledger.entries.length ? <Typography>No activity in this date range.</Typography> : ledger.entries.map((entry, index) => <Stack key={`${entry.journalId}-${index}`} component={Paper} variant="outlined" direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" sx={{ p: 1.5 }}>
            <Typography>{new Date(entry.postedAt).toLocaleString('en-IN')} · {entry.description}</Typography>
            <Typography>Debit {money(entry.debitPaise)} · Credit {money(entry.creditPaise)} · Balance {money(entry.runningBalancePaise)}</Typography>
          </Stack>)}
          {ledgerNext && <Button onClick={() => void loadLedger(ledgerNext)}>Load more entries</Button>}
        </>}
      </Stack>
    </Paper>
  </Stack>;
}
