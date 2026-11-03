import { hasPermission } from '../security/authorization.js';
import { postJournal, type PostingCommand } from './postJournal.js';
import { postReversal } from './postReversal.js';
import type { ReversalRequest } from './reversal.js';

/**
 * Boundary for future authenticated routes.
 * The actor ID MUST come from a verified session, never request JSON.
 * Do not expose the lower-level posting primitives as HTTP handlers.
 */
export class LedgerAccessDenied extends Error {
  constructor() { super('Ledger posting is not permitted for this organization'); }
}

export async function postAuthorizedJournal(
  verifiedAuthUserId: string,
  command: Omit<PostingCommand, 'actorAuthUserId'>,
) {
  if (!await hasPermission(verifiedAuthUserId, command.organizationId, 'ledger:post')) {
    throw new LedgerAccessDenied();
  }
  return postJournal({ ...command, actorAuthUserId: verifiedAuthUserId });
}

export async function postAuthorizedReversal(
  verifiedAuthUserId: string,
  request: Omit<ReversalRequest, 'actorAuthUserId'>,
) {
  if (!await hasPermission(verifiedAuthUserId, request.organizationId, 'ledger:post')) {
    throw new LedgerAccessDenied();
  }
  return postReversal({ ...request, actorAuthUserId: verifiedAuthUserId });
}
