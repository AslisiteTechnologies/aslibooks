import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { PostingError, validatePosting, type PostingCommand } from './postJournal.js';

const organizationId = new Types.ObjectId().toHexString();
const accountA = new Types.ObjectId().toHexString();
const accountB = new Types.ObjectId().toHexString();
const valid: PostingCommand = {
  organizationId, actorAuthUserId: 'test-user', idempotencyKey: 'invoice:000001',
  description: 'Test entry', lines: [
    { accountId: accountA, debitPaise: 15000, creditPaise: 0 },
    { accountId: accountB, debitPaise: 0, creditPaise: 15000 },
  ],
};
describe('internal journal posting validation', () => {
  it('accepts balanced integer-paise entries', () => expect(() => validatePosting(valid)).not.toThrow());
  it('rejects unbalanced entries', () => expect(() => validatePosting({
    ...valid, lines: [{ ...valid.lines[0] }, { ...valid.lines[1], creditPaise: 14999 }],
  })).toThrow(PostingError));
  it('rejects floating-point amounts', () => expect(() => validatePosting({
    ...valid, lines: [{ ...valid.lines[0], debitPaise: 150.5 }, valid.lines[1]],
  })).toThrow());
  it('rejects both sides positive', () => expect(() => validatePosting({
    ...valid, lines: [{ ...valid.lines[0], creditPaise: 1 }, valid.lines[1]],
  })).toThrow());
  it('rejects unknown account IDs', () => expect(() => validatePosting({
    ...valid, lines: [{ ...valid.lines[0], accountId: 'not-an-object-id' }, valid.lines[1]],
  })).toThrow());
  it('rejects oversized journal totals', () => expect(() => validatePosting({
    ...valid, lines: [
      { accountId: accountA, debitPaise: Number.MAX_SAFE_INTEGER, creditPaise: 0 },
      { accountId: accountA, debitPaise: 1, creditPaise: 0 },
      { accountId: accountB, debitPaise: 0, creditPaise: Number.MAX_SAFE_INTEGER },
      { accountId: accountB, debitPaise: 0, creditPaise: 1 },
    ],
  })).toThrow());
});
