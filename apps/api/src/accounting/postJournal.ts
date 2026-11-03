import mongoose, { Types } from 'mongoose';
import { AccountModel } from '../models/account.js';
import { JournalModel } from '../models/journal.js';
import { AuditEventModel } from '../models/auditEvent.js';

export type PostingLine = { accountId: string; debitPaise: number; creditPaise: number };
export type PostingCommand = {
  organizationId: string;
  actorAuthUserId: string;
  idempotencyKey: string;
  description: string;
  lines: PostingLine[];
};
export class PostingError extends Error {
  constructor(public readonly code: 'INVALID' | 'ACCOUNT' | 'CONFLICT', message: string) { super(message); }
}
export function validatePosting(command: PostingCommand): void {
  if (!Types.ObjectId.isValid(command.organizationId)) throw new PostingError('INVALID', 'Invalid organization');
  if (!command.actorAuthUserId.trim()) throw new PostingError('INVALID', 'Actor required');
  if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(command.idempotencyKey)) throw new PostingError('INVALID', 'Invalid idempotency key');
  if (!command.description.trim() || command.description.length > 500) throw new PostingError('INVALID', 'Invalid description');
  if (command.lines.length < 2 || command.lines.length > 200) throw new PostingError('INVALID', 'Journal requires 2 to 200 lines');
  let debit = 0;
  let credit = 0;
  for (const line of command.lines) {
    if (!Types.ObjectId.isValid(line.accountId)) throw new PostingError('INVALID', 'Invalid account ID');
    if (![line.debitPaise, line.creditPaise].every(v => Number.isSafeInteger(v) && v >= 0))
      throw new PostingError('INVALID', 'Amounts must be nonnegative safe integer paise');
    if ((line.debitPaise > 0) === (line.creditPaise > 0))
      throw new PostingError('INVALID', 'Exactly one side must be positive');
    debit += line.debitPaise;
    credit += line.creditPaise;
    if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit))
      throw new PostingError('INVALID', 'Total exceeds safe integer range');
  }
  if (debit !== credit) throw new PostingError('INVALID', 'Journal is not balanced');
}

function samePayload(existing: { description: string; lines: PostingLine[] }, command: PostingCommand) {
  return existing.description === command.description &&
    existing.lines.length === command.lines.length &&
    existing.lines.every((line, i) =>
      String(line.accountId) === command.lines[i].accountId &&
      line.debitPaise === command.lines[i].debitPaise &&
      line.creditPaise === command.lines[i].creditPaise);
}

/** Internal-only posting primitive. Caller MUST verify active tenant membership and ledger:post permission. */
export async function postJournal(command: PostingCommand): Promise<{ journalId: string; replayed: boolean }> {
  validatePosting(command);
  const organizationId = new Types.ObjectId(command.organizationId);
  const existing = await JournalModel.findOne({ organizationId, idempotencyKey: command.idempotencyKey }).exec();
  if (existing) {
    if (!samePayload(existing, command))
      throw new PostingError('CONFLICT', 'Idempotency key already used with different journal');
    return { journalId: String(existing._id), replayed: true };
  }
  try {
    return await mongoose.connection.transaction(async (session) => {
      const accounts = await AccountModel.find({
        _id: { $in: command.lines.map(line => new Types.ObjectId(line.accountId)) },
        organizationId,
        active: true,
      }).session(session).select('_id').lean();
      const available = new Set(accounts.map(account => String(account._id)));
      if (command.lines.some(line => !available.has(line.accountId)))
        throw new PostingError('ACCOUNT', 'Account missing, inactive, or outside organization');
      const [journal] = await JournalModel.create([{
        organizationId,
        idempotencyKey: command.idempotencyKey,
        currency: 'INR',
        description: command.description,
        lines: command.lines.map(line => ({
          accountId: new Types.ObjectId(line.accountId),
          debitPaise: line.debitPaise,
          creditPaise: line.creditPaise,
        })),
        postedAt: new Date(),
      }], { session });
      await AuditEventModel.create([{
        organizationId,
        actorAuthUserId: command.actorAuthUserId,
        action: 'journal.posted',
        resourceType: 'journal',
        resourceId: String(journal._id),
      }], { session });
      return { journalId: String(journal._id), replayed: false };
    });
  } catch (error) {
    if (error instanceof PostingError) throw error;
    // Unique index guarantees a concurrent retry cannot post the same key twice.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      const retry = await JournalModel.findOne({ organizationId, idempotencyKey: command.idempotencyKey }).exec();
      if (retry && samePayload(retry, command))
        return { journalId: String(retry._id), replayed: true };
      throw new PostingError('CONFLICT', 'Idempotency key conflict');
    }
    // A competing transaction can surface a transient write conflict instead
    // of E11000. Resolve a committed identical posting before returning the error.
    // Never assume a transient error means a journal was committed.
    if (typeof error === 'object' && error !== null &&
        'hasErrorLabel' in error && typeof error.hasErrorLabel === 'function' &&
        error.hasErrorLabel('TransientTransactionError')) {
      const committed = await JournalModel.findOne({
        organizationId, idempotencyKey: command.idempotencyKey,
      }).exec();
      if (committed) {
        if (!samePayload(committed, command))
          throw new PostingError('CONFLICT', 'Idempotency key already used with different journal');
        return { journalId: String(committed._id), replayed: true };
      }
    }
    throw error;
  }
}
