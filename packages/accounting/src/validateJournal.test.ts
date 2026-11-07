import { describe, expect, it } from 'vitest';
import { validateJournalLines } from './validateJournal.js';

const valid = [
  { accountId: 'cash', debitPaise: 150000, creditPaise: 0 },
  { accountId: 'sales', debitPaise: 0, creditPaise: 150000 },
];

describe('validateJournalLines', () => {
  it('accepts balanced entries', () => expect(() => validateJournalLines(valid)).not.toThrow());
  it('rejects unbalanced entries', () => expect(() => validateJournalLines([{ ...valid[0], debitPaise: 150001 }, valid[1]])).toThrow('balance'));
  it('rejects fractional money', () => expect(() => validateJournalLines([{ ...valid[0], debitPaise: 1.5 }, valid[1]])).toThrow('safe integer'));
  it('rejects double-sided lines', () => expect(() => validateJournalLines([{ ...valid[0], creditPaise: 1 }, valid[1]])).toThrow('exactly one'));
  it('rejects empty journals', () => expect(() => validateJournalLines([])).toThrow('at least two'));
});
