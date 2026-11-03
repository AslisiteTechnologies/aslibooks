import { Types } from 'mongoose';
import { JournalModel } from '../models/journal.js';
import { postJournal, PostingError, type PostingCommand } from './postJournal.js';

export type ReversalRequest = {
  organizationId: string;
  originalJournalId: string;
  actorAuthUserId: string;
  idempotencyKey: string;
  reason: string;
};

/**
 * Build a balanced reversing entry without mutating the original journal.
 * Internal-only: the caller must authorize the actor for this organization.
 *
 * IMPORTANT: This is preparation only. A complete reversal workflow must
 * atomically link the new journal to the original and prevent double reversal.
 * Do not expose this helper as a user-facing reversal endpoint.
 */
export async function prepareReversal(request: ReversalRequest): Promise<PostingCommand> {
  if (!Types.ObjectId.isValid(request.organizationId) ||
      !Types.ObjectId.isValid(request.originalJournalId)) {
    throw new PostingError('INVALID', 'Invalid organization or journal identifier');
  }
  const reason = request.reason.trim();
  if (!reason || reason.length > 200) {
    throw new PostingError('INVALID', 'Reversal reason is required (maximum 200 characters)');
  }
  const original = await JournalModel.findOne({
    _id: new Types.ObjectId(request.originalJournalId),
    organizationId: new Types.ObjectId(request.organizationId),
  }).exec();
  if (!original) throw new PostingError('INVALID', 'Original journal not found in organization');
  const description = `Reversal: ${reason}`;
  const command: PostingCommand = {
    organizationId: request.organizationId,
    actorAuthUserId: request.actorAuthUserId,
    idempotencyKey: request.idempotencyKey,
    description,
    lines: original.lines.map((line: {
      accountId: Types.ObjectId;
      debitPaise: number;
      creditPaise: number;
    }) => ({
      accountId: String(line.accountId),
      debitPaise: line.creditPaise,
      creditPaise: line.debitPaise,
    })),
  };
  return command;
}

// Posting a reversal is intentionally not implemented here. Calling postJournal
// directly would omit reversalOf linkage and double-reversal prevention.
void postJournal;
