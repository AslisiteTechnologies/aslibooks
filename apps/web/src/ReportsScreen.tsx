import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, type Account, type AgingSummary, type BalanceSheetResult, type ControlReconciliation, type GeneralLedgerResult, type Organization, type ProfitAndLossResult, type TrialBalanceRow } from './api';
import { downloadCsv } from './csv';
import { buildPrintableReportHtml, type PrintableReportSection } from './printableReport';

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
  const [receivables, setReceivables] = useState<AgingSummary | null>(null);
  const [payables, setPayables] = useState<AgingSummary | null>(null);
  const [reconciliation, setReconciliation] = useState<ControlReconciliation | null>(null);
  const [trialTotals, setTrialTotals] = useState({ debit: 0, credit: 0, balanced: true });
  const [asOf, setAsOf] = useState(todayInIndia());
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(todayInIndia());
  const [ledger, setLedger] = useState<GeneralLedgerResult | null>(null);
  const [ledgerNext, setLedgerNext] = useState<string | null>(null);
  const [exportingLedger, setExportingLedger] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aiConsent, setAiConsent] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<Awaited<ReturnType<typeof api.explainFinancialSummary>> | null>(null);

  useEffect(() => {
    let current = true;
    async function load() {
      setLoading(true); setError('');
      try {
        const [firstPage, trial, pnl, balance, arAging, apAging, controls] = await Promise.all([
          api.accounts(organization.id), api.trialBalance(organization.id, asOf),
          api.profitAndLoss(organization.id, asOf), api.balanceSheet(organization.id, asOf),
          api.agedReceivables(organization.id, asOf), api.agedPayables(organization.id, asOf), api.controlAccountReconciliation(organization.id),
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
          setReceivables(arAging); setPayables(apAging);
          setReconciliation(controls);
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
  async function exportFullLedger() {
    if (!ledger || exportingLedger) return;
    setExportingLedger(true); setError('');
    try {
      let after = '';
      let firstPage: GeneralLedgerResult | undefined;
      const entries: GeneralLedgerResult['entries'] = [];
      do {
        const page = await api.generalLedger(organization.id, ledger.account.id, ledger.from, ledger.to, after);
        firstPage ??= page;
        entries.push(...page.entries);
        after = page.next ?? '';
      } while (after);
      if (!firstPage) return;
      const rows = [[ '', 'Opening balance', '', 0, 0, firstPage.openingBalancePaise ],
        ...entries.map(entry => [entry.journalId, entry.description, new Date(entry.postedAt).toISOString(), entry.debitPaise, entry.creditPaise, entry.runningBalancePaise])];
      downloadCsv(`general-ledger-${ledger.account.code}-${ledger.from}-${ledger.to}.csv`, ['Journal ID', 'Description', 'Posted at', 'Debit paise', 'Credit paise', 'Running balance paise'], rows);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Full general ledger export could not be loaded.'); }
    finally { setExportingLedger(false); }
  }

  async function requestExplanation() {
    if (!profitLoss || !balanceSheet || !receivables || !payables || !aiConsent || aiLoading) return;
    setAiLoading(true); setError(''); setAiExplanation(null);
    try {
      setAiExplanation(await api.explainFinancialSummary(organization.id, {
        period: `${profitLoss.from} through ${profitLoss.to}`, currency: 'INR',
        revenuePaise: profitLoss.totalIncomePaise, expensesPaise: profitLoss.totalExpensesPaise,
        netProfitPaise: profitLoss.netProfitPaise, cashPaise: balanceSheet.accounts.filter(row => row.type === 'asset' && ['1000', '1010'].includes(row.code)).reduce((sum, row) => sum + row.balancePaise, 0),
        receivablesPaise: receivables.totalOutstandingPaise, payablesPaise: payables.totalOutstandingPaise,
      }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'AI explanation could not be generated.'); }
    finally { setAiLoading(false); }
  }

  function printReports() {
    if (!profitLoss || !balanceSheet || !receivables || !payables) return;
    const agingRows = (label: string, summary: AgingSummary) => [
      [`${label} · ${summary.documentCount} documents`, money(summary.totalOutstandingPaise)],
      ...Object.entries(summary.buckets).map(([bucket, values]) => [bucket, money(values.amountPaise)]),
    ];
    const sections: PrintableReportSection[] = [
      { title: 'Trial balance', rows: [...trialBalance.map(row => [`${row.code} · ${row.name}`, `Debit ${money(row.debitBalancePaise)} · Credit ${money(row.creditBalancePaise)}`]), ['Totals', `Debit ${money(trialTotals.debit)} · Credit ${money(trialTotals.credit)} · ${trialTotals.balanced ? 'Balanced' : 'Out of balance'}`]] },
      { title: 'Profit and loss', rows: [...profitLoss.accounts.map(row => [`${row.code} · ${row.name}`, money(row.balancePaise)]), ['Total income', money(profitLoss.totalIncomePaise)], ['Total expenses', money(profitLoss.totalExpensesPaise)], ['Net profit', money(profitLoss.netProfitPaise)]] },
      { title: 'Balance sheet', rows: [...balanceSheet.accounts.map(row => [`${row.code} · ${row.name}`, money(row.balancePaise)]), ['Assets', money(balanceSheet.totalAssetsPaise)], ['Liabilities and equity including current earnings', money(balanceSheet.liabilitiesAndEquityPaise)], ['Status', balanceSheet.balanced ? 'Balanced' : 'Out of balance']] },
      { title: 'Receivables aging', rows: agingRows('Receivables', receivables) },
      { title: 'Payables aging', rows: agingRows('Payables', payables) },
    ];
    if (reconciliation) sections.push({ title: 'Receivable and payable control reconciliation', rows: [
      ['Accounts receivable', `Ledger ${money(reconciliation.receivables.ledgerBalancePaise)} · Documents ${money(reconciliation.receivables.documentBalancePaise)} · Difference ${money(reconciliation.receivables.differencePaise)} · ${reconciliation.receivables.reconciled ? 'Reconciled' : 'Unreconciled'}`],
      ['Accounts payable', `Ledger ${money(reconciliation.payables.ledgerBalancePaise)} · Documents ${money(reconciliation.payables.documentBalancePaise)} · Difference ${money(reconciliation.payables.differencePaise)} · ${reconciliation.payables.reconciled ? 'Reconciled' : 'Unreconciled'}`],
    ] });
    const popup = window.open('', '_blank');
    if (!popup) { setError('Allow pop-ups to print or save these reports as PDF.'); return; }
    popup.opener = null;
    popup.document.open();
    popup.document.write(buildPrintableReportHtml(organization.name, asOf, sections));
    popup.document.close();
  }

  return <Stack spacing={2}>
    <Typography variant="h5">Reports</Typography>
    <Button variant="outlined" onClick={printReports} disabled={loading || !profitLoss || !balanceSheet || !receivables || !payables}>Print reports / Save as PDF</Button>
    {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={1.5}>
        <Typography variant="h6">AI report explanation</Typography>
        <Typography color="text.secondary">Optional. Only aggregated report totals and the period are sent to the configured OpenAI service when you request an explanation. No account names, customer/vendor details, ledger lines, or documents are sent. The result is informational and cannot post transactions.</Typography>
        <FormControlLabel control={<Checkbox checked={aiConsent} onChange={event => { setAiConsent(event.target.checked); setAiExplanation(null); }} />} label="I agree to send these report totals to OpenAI for this explanation." />
        <Button variant="outlined" disabled={!aiConsent || !profitLoss || !balanceSheet || !receivables || !payables || aiLoading} onClick={() => void requestExplanation()}>{aiLoading ? 'Preparing explanation…' : 'Explain these report totals'}</Button>
        {aiExplanation && <Stack role="status" spacing={1}>
          <Typography>{aiExplanation.summary}</Typography>
          {aiExplanation.observations.map((item, index) => <Typography key={`observation-${index}`}>• {item}</Typography>)}
          {aiExplanation.questions.map((item, index) => <Typography key={`question-${index}`} color="text.secondary">Consider: {item}</Typography>)}
        </Stack>}
      </Stack>
    </Paper>
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={2}>
        <Typography variant="h6">Trial balance</Typography>
        <Button variant="outlined" disabled={!trialBalance.length} onClick={() => downloadCsv(`trial-balance-${asOf}.csv`, ['Account code', 'Account', 'Type', 'Debit paise', 'Credit paise'], [
          ...trialBalance.map(row => [row.code, row.name, row.type, row.debitBalancePaise, row.creditBalancePaise]),
          ['TOTAL', '', '', trialTotals.debit, trialTotals.credit],
        ])}>Download trial balance CSV</Button>
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
        <Button variant="outlined" onClick={() => downloadCsv(`profit-and-loss-${profitLoss.to}.csv`, ['Account code', 'Account', 'Type', 'Balance paise'], [
          ...profitLoss.accounts.map(row => [row.code, row.name, row.type, row.balancePaise]),
          ['TOTAL INCOME', '', '', profitLoss.totalIncomePaise], ['TOTAL EXPENSES', '', '', profitLoss.totalExpensesPaise], ['NET PROFIT', '', '', profitLoss.netProfitPaise],
        ])}>Download profit and loss CSV</Button>
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
        <Button variant="outlined" onClick={() => downloadCsv(`balance-sheet-${balanceSheet.asOf}.csv`, ['Account code', 'Account', 'Type', 'Balance paise'], [
          ...balanceSheet.accounts.map(row => [row.code, row.name, row.type, row.balancePaise]),
          ['TOTAL ASSETS', '', '', balanceSheet.totalAssetsPaise], ['TOTAL LIABILITIES', '', '', balanceSheet.totalLiabilitiesPaise], ['TOTAL EQUITY INCLUDING EARNINGS', '', '', balanceSheet.liabilitiesAndEquityPaise],
        ])}>Download balance sheet CSV</Button>
        <Typography color="text.secondary">As of {balanceSheet.asOf}; current year earnings are included in equity.</Typography>
        {balanceSheet.accounts.map(row => <Stack key={row.accountId} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between">
          <Typography>{row.code} · {row.name} · {row.type}</Typography><Typography>{money(row.balancePaise)}</Typography>
        </Stack>)}
        <Typography>Assets {money(balanceSheet.totalAssetsPaise)} · Liabilities {money(balanceSheet.totalLiabilitiesPaise)} · Equity {money(balanceSheet.totalEquityPaise)} · Current earnings {money(balanceSheet.currentEarningsPaise)}</Typography>
        <Typography color={balanceSheet.balanced ? 'success.main' : 'error.main'}>{balanceSheet.balanced ? 'Balance sheet balances' : 'Balance sheet out of balance'}</Typography>
      </Stack>
    </Paper>}
    {receivables && payables && <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={2}>
        <Typography variant="h6">Receivables and payables aging</Typography>
        <Button variant="outlined" onClick={() => downloadCsv(`aging-${asOf}.csv`, ['Report', 'As of', 'Bucket', 'Documents', 'Amount paise'],
          ( [['Receivables', receivables], ['Payables', payables]] as const).flatMap(([label, summary]) => Object.entries(summary.buckets).map(([bucket, values]) => [label, summary.asOf, bucket, values.documentCount, values.amountPaise])),
        )}>Download aging CSV</Button>
        <Typography color="text.secondary">Outstanding document balances as of {asOf}; overdue days use India-local calendar dates. Undated documents are shown separately.</Typography>
        {([['Receivables', receivables], ['Payables', payables]] as const).map(([label, summary]) => <Stack key={label} spacing={0.75}>
          <Typography fontWeight={700}>{label} · {money(summary.totalOutstandingPaise)} ({summary.documentCount} documents)</Typography>
          <Typography>Not due {money(summary.buckets.notDue.amountPaise)} · Due today {money(summary.buckets.current.amountPaise)}</Typography>
          <Typography>1–30 days {money(summary.buckets.days1To30.amountPaise)} · 31–60 days {money(summary.buckets.days31To60.amountPaise)} · 61–90 days {money(summary.buckets.days61To90.amountPaise)} · Over 90 days {money(summary.buckets.over90.amountPaise)} · Undated {money(summary.buckets.undated.amountPaise)}</Typography>
        </Stack>)}
      </Stack>
    </Paper>}
    {reconciliation && <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={1}>
        <Typography variant="h6">Receivable and payable control reconciliation</Typography>
        <Typography color="text.secondary">Ledger control balances compared with outstanding posted documents as of {reconciliation.asOf}.</Typography>
        {([['Accounts receivable', reconciliation.receivables], ['Accounts payable', reconciliation.payables]] as const).map(([label, row]) => <Stack key={label} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
          <Typography>{label} · {row.accountName}</Typography>
          <Typography>Ledger {money(row.ledgerBalancePaise)} · Documents {money(row.documentBalancePaise)} · Difference {money(row.differencePaise)} · {row.reconciled ? 'Reconciled' : 'Unreconciled'}</Typography>
        </Stack>)}
      </Stack>
    </Paper>}
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={2}>
        <Typography variant="h6">General ledger</Typography>
        {ledger && <Button variant="outlined" onClick={() => void exportFullLedger()} disabled={exportingLedger}>{exportingLedger ? 'Preparing full export…' : 'Download full ledger CSV'}</Button>}
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
