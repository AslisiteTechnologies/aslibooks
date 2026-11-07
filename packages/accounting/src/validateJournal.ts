export interface JournalLine {
  accountId: string;
  debitPaise: number;
  creditPaise: number;
}

export function validateJournalLines(lines: readonly JournalLine[]): void {
  if (lines.length < 2) throw new Error('Journal requires at least two lines');
  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    if (!line.accountId) throw new Error('Account is required');
    for (const amount of [line.debitPaise, line.creditPaise]) {
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Amounts must be nonnegative safe integer paise');
    }
    if ((line.debitPaise > 0) === (line.creditPaise > 0)) throw new Error('Each line must contain exactly one positive debit or credit');
    debit += line.debitPaise;
    credit += line.creditPaise;
    if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit)) throw new Error('Journal total exceeds safe integer range');
  }
  if (debit !== credit) throw new Error('Journal must balance');
}
