import mongoose, { Types } from 'mongoose';
import { JournalModel } from '../models/journal.js';
import { AccountModel } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { fenceLedgerPermission } from '../security/authorization.js';
import { PostingError, validatePosting, type PostingCommand } from './postJournal.js';
import type { ReversalRequest } from './reversal.js';

export type ReversalResult = { journalId: string; replayed: boolean };

function matchesRequest(existing: {
  idempotencyKey: string;
  description: string;
  reversalOf?: Types.ObjectId;
}, originalId: string, command: PostingCommand): boolean {
  return String(existing.reversalOf) === originalId &&
    existing.idempotencyKey === command.idempotencyKey &&
    existing.description === command.description;
}

/**
 * Internal accounting primitive only. Caller MUST authorize active membership
 * and ledger:post for the organization. Never expose directly as an HTTP route.
 */
export async function postReversal(request: ReversalRequest, options: { enforceMembershipFence?: boolean } = {}): Promise<ReversalResult> {
  if (!Types.ObjectId.isValid(request.organizationId) ||
      !Types.ObjectId.isValid(request.originalJournalId)) {
    throw new PostingError('INVALID', 'Invalid journal or organization ID');
  }
  const reason = request.reason.trim();
  if (!reason || reason.length > 200) throw new PostingError('INVALID', 'Invalid reversal reason');
  const organizationId = new Types.ObjectId(request.organizationId);
  const originalId = new Types.ObjectId(request.originalJournalId);
  const description = `Reversal: ${reason}`;
  // Validate caller-controlled fields before entering the transaction.
  validatePosting({
    organizationId: request.organizationId,
    actorAuthUserId: request.actorAuthUserId,
    idempotencyKey: request.idempotencyKey,
    description,
    lines: [
      { accountId: originalId.toHexString(), debitPaise: 1, creditPaise: 0 },
      { accountId: originalId.toHexString(), debitPaise: 0, creditPaise: 1 },
    ],
  });
  const findExisting = () => JournalModel.findOne({
    organizationId, $or: [
      { idempotencyKey: request.idempotencyKey },
      { reversalOf: originalId },
    ],
  }).exec();
  const prior = options.enforceMembershipFence ? null : await findExisting();
  if (prior) {
    if (matchesRequest(prior, request.originalJournalId, {
      organizationId: request.organizationId,
      actorAuthUserId: request.actorAuthUserId,
      idempotencyKey: request.idempotencyKey,
      description, lines: [],
    })) return { journalId: String(prior._id), replayed: true };
    throw new PostingError('CONFLICT', 'Journal already reversed or idempotency key reused');
  }
  try {
    return await mongoose.connection.transaction(async (session) => {
      if (options.enforceMembershipFence &&
          !await fenceLedgerPermission(request.actorAuthUserId, request.organizationId, session))
        throw new PostingError('CONFLICT', 'Ledger posting permission denied');
      if (options.enforceMembershipFence) {
        const existing = await JournalModel.findOne({
          organizationId, $or: [
            { idempotencyKey: request.idempotencyKey },
            { reversalOf: originalId },
          ],
        }).session(session).exec();
        if (existing) {
          if (matchesRequest(existing, request.originalJournalId, {
            organizationId: request.organizationId,
            actorAuthUserId: request.actorAuthUserId,
            idempotencyKey: request.idempotencyKey,
            description, lines: [],
          })) return { journalId: String(existing._id), replayed: true };
          throw new PostingError('CONFLICT', 'Journal already reversed or idempotency key reused');
        }
      }
      const original = await JournalModel.findOne({
        _id: originalId, organizationId,
      }).session(session).exec();
      if (!original) throw new PostingError('INVALID', 'Original journal not found');
      if (original.reversalOf) throw new PostingError('INVALID', 'Cannot reverse a reversal journal');
      const lines = original.lines.map((line: {
        accountId: Types.ObjectId; debitPaise: number; creditPaise: number;
      }) => ({
        accountId: String(line.accountId),
        debitPaise: line.creditPaise,
        creditPaise: line.debitPaise,
      }));
      const command: PostingCommand = {
        organizationId: request.organizationId,
        actorAuthUserId: request.actorAuthUserId,
        idempotencyKey: request.idempotencyKey,
        description,
        lines,
      };
      validatePosting(command);
      const accounts = await AccountModel.find({
        organizationId,
        active: true,
        _id: { $in: lines.map((line: { accountId: string }) => new Types.ObjectId(line.accountId)) },
      }).session(session).select('_id').lean();
      const activeIds = new Set(accounts.map(account => String(account._id)));
      if (lines.some((line: { accountId: string }) => !activeIds.has(line.accountId))) {
        throw new PostingError('ACCOUNT', 'Reversal account missing, inactive, or outside organization');
      }
      const [journal] = await JournalModel.create([{
        organizationId, idempotencyKey: request.idempotencyKey,
        description, currency: original.currency, lines,
        reversalOf: originalId, postedAt: new Date(),
      }], { session });
      await AuditEventModel.create([{
        organizationId,
        actorAuthUserId: request.actorAuthUserId,
        action: 'journal.reversed',
        resourceType: 'journal',
        resourceId: String(journal._id),
      }], { session });
      return { journalId: String(journal._id), replayed: false };
    });
  } catch (error) {
    if (error instanceof PostingError) throw error;
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      // Never resolve a fenced request using a non-transactional replay read:
      // the membership may have been revoked while the transaction failed.
      // A caller can retry through the authorized entry point, which fences
      // membership again before returning an existing journal.
      if (options.enforceMembershipFence)
        throw new PostingError('CONFLICT', 'Concurrent reversal; retry authorized request');
      const existing = await findExisting();
      if (existing && matchesRequest(existing, request.originalJournalId, {
        organizationId: request.organizationId,
        actorAuthUserId: request.actorAuthUserId,
        idempotencyKey: request.idempotencyKey,
        description, lines: [],
      })) return { journalId: String(existing._id), replayed: true };
      throw new PostingError('CONFLICT', 'Journal already reversed or idempotency key reused');
    }
    throw error;
  }
}
