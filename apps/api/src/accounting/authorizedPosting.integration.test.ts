import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MembershipModel } from '../models/membership.js';
import { AccountModel } from '../models/account.js';
import { JournalModel } from '../models/journal.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { LedgerAccessDenied, postAuthorizedJournal, postAuthorizedReversal } from './authorizedPosting.js';

const uri = process.env.MONGODB_TEST_URI;
const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);
const org = new Types.ObjectId();
const otherOrg = new Types.ObjectId();
const debitAccount = new Types.ObjectId();
const creditAccount = new Types.ObjectId();
const suffix = new Types.ObjectId().toHexString();
const actor = `authorized-owner-${suffix}`;
const suspended = `suspended-user-${suffix}`;
const viewer = `viewer-user-${suffix}`;
const input = {
  organizationId: org.toHexString(),
  idempotencyKey: `auth-post:${suffix}`,
  description: 'Authorized journal',
  lines: [
    { accountId: debitAccount.toHexString(), debitPaise: 100, creditPaise: 0 },
    { accountId: creditAccount.toHexString(), debitPaise: 0, creditPaise: 100 },
  ],
};

describe.skipIf(!enabled)('authorized ledger posting integration', () => {
  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName: dbName!, serverSelectionTimeoutMS: 10000 });
    await Promise.all([MembershipModel.init(), AccountModel.init(), JournalModel.init(), AuditEventModel.init()]);
    await MembershipModel.create([
      { organizationId: org, authUserId: actor, role: 'owner', status: 'active' },
      { organizationId: org, authUserId: suspended, role: 'owner', status: 'suspended' },
      { organizationId: org, authUserId: viewer, role: 'viewer', status: 'active' },
      { organizationId: otherOrg, authUserId: `other-owner-${suffix}`, role: 'owner', status: 'active' },
    ]);
    await AccountModel.create([
      { _id: debitAccount, organizationId: org, code: `AUTH-D-${suffix}`, name: 'Debit', type: 'asset' },
      { _id: creditAccount, organizationId: org, code: `AUTH-C-${suffix}`, name: 'Credit', type: 'income' },
    ]);
  });

  it('rejects users without an active posting membership before writing', async () => {
    for (const user of [suspended, viewer, `other-owner-${suffix}`, `unknown-${suffix}`]) {
      await expect(postAuthorizedJournal(user, input)).rejects.toBeInstanceOf(LedgerAccessDenied);
    }
    expect(await JournalModel.countDocuments({ organizationId: org, idempotencyKey: input.idempotencyKey })).toBe(0);
  });

  it('posts for an active owner and rejects unauthorized reversals', async () => {
    const posted = await postAuthorizedJournal(actor, input);
    expect(posted.replayed).toBe(false);
    const reversal = {
      organizationId: org.toHexString(),
      originalJournalId: posted.journalId,
      idempotencyKey: `auth-reverse:${suffix}`,
      reason: 'Correction',
    };
    for (const user of [suspended, viewer, `other-owner-${suffix}`]) {
      await expect(postAuthorizedReversal(user, reversal)).rejects.toBeInstanceOf(LedgerAccessDenied);
    }
    expect(await JournalModel.countDocuments({ organizationId: org, reversalOf: new Types.ObjectId(posted.journalId) })).toBe(0);
    const reversed = await postAuthorizedReversal(actor, reversal);
    expect(reversed.replayed).toBe(false);
    expect(await AuditEventModel.countDocuments({ organizationId: org, resourceId: reversed.journalId, action: 'journal.reversed' })).toBe(1);
  });

  it('fences authorized journal and reversal replays in a MongoDB transaction', async () => {
    const original = await JournalModel.findOne({
      organizationId: org, idempotencyKey: input.idempotencyKey,
    });
    expect(original).toBeTruthy();
    const before = await MembershipModel.findOne({
      organizationId: org, authUserId: actor,
    }).lean<{ ledgerAuthorizationFence?: number }>();
    const initialFence = before!.ledgerAuthorizationFence ?? 0;
    const posted = await postAuthorizedJournal(actor, input);
    expect(posted).toEqual({ journalId: String(original!._id), replayed: true });
    const reversed = await postAuthorizedReversal(actor, {
      organizationId: org.toHexString(),
      originalJournalId: String(original!._id),
      idempotencyKey: `auth-reverse:${suffix}`,
      reason: 'Correction',
    });
    expect(reversed.replayed).toBe(true);
    const after = await MembershipModel.findOne({
      organizationId: org, authUserId: actor,
    }).lean<{ ledgerAuthorizationFence?: number }>();
    expect(after!.ledgerAuthorizationFence).toBe(initialFence + 2);
    expect(await JournalModel.countDocuments({
      organizationId: org, idempotencyKey: input.idempotencyKey,
    })).toBe(1);
    expect(await JournalModel.countDocuments({
      organizationId: org, idempotencyKey: `auth-reverse:${suffix}`,
    })).toBe(1);
  });

  it('rejects new journal and reversal requests after membership suspension', async () => {
    const original = await JournalModel.findOne({
      organizationId: org, idempotencyKey: input.idempotencyKey,
    });
    expect(original).toBeTruthy();
    await MembershipModel.updateOne(
      { organizationId: org, authUserId: actor },
      { $set: { status: 'suspended' } },
    );
    try {
      // Authorization must precede even an idempotent replay: a revoked
      // member must not learn a previously posted journal's identifier.
      await expect(postAuthorizedJournal(actor, input))
        .rejects.toBeInstanceOf(LedgerAccessDenied);
      await expect(postAuthorizedReversal(actor, {
        organizationId: org.toHexString(),
        originalJournalId: String(original!._id),
        idempotencyKey: `auth-reverse:${suffix}`,
        reason: 'Correction',
      })).rejects.toBeInstanceOf(LedgerAccessDenied);
      const blockedKey = `revoked-post:${suffix}`;
      await expect(postAuthorizedJournal(actor, {
        ...input, idempotencyKey: blockedKey,
      })).rejects.toBeInstanceOf(LedgerAccessDenied);
      await expect(postAuthorizedReversal(actor, {
        organizationId: org.toHexString(),
        originalJournalId: String(original!._id),
        idempotencyKey: `revoked-reverse:${suffix}`,
        reason: 'Revoked user must not reverse',
      })).rejects.toBeInstanceOf(LedgerAccessDenied);
      expect(await JournalModel.countDocuments({
        organizationId: org, idempotencyKey: blockedKey,
      })).toBe(0);
      expect(await JournalModel.countDocuments({
        organizationId: org, idempotencyKey: `revoked-reverse:${suffix}`,
      })).toBe(0);
    } finally {
      await MembershipModel.updateOne(
        { organizationId: org, authUserId: actor },
        { $set: { status: 'active' } },
      );
    }
  });

  it('aborts a stale membership-fenced transaction when suspension wins', async () => {
    // A transaction that started before revocation must not use its stale
    // snapshot to post after revocation has committed.
    const session = await mongoose.startSession();
    const concurrentKey = `stale-snapshot:${suffix}`;
    try {
      session.startTransaction();
      await MembershipModel.findOne({
        organizationId: org, authUserId: actor, status: 'active',
      }).session(session);
      await MembershipModel.updateOne(
        { organizationId: org, authUserId: actor },
        { $set: { status: 'suspended' } },
      );
      await expect(MembershipModel.updateOne(
        {
          organizationId: org, authUserId: actor,
          status: 'active', role: { $in: ['owner', 'admin', 'accountant'] },
        },
        { $inc: { ledgerAuthorizationFence: 1 } },
        { session },
      )).rejects.toThrow();
      await session.abortTransaction();
      await expect(postAuthorizedJournal(actor, {
        ...input, idempotencyKey: concurrentKey,
      })).rejects.toBeInstanceOf(LedgerAccessDenied);
      expect(await JournalModel.countDocuments({
        organizationId: org, idempotencyKey: concurrentKey,
      })).toBe(0);
    } finally {
      if (session.inTransaction()) await session.abortTransaction();
      await session.endSession();
      await MembershipModel.updateOne(
        { organizationId: org, authUserId: actor },
        { $set: { status: 'active' } },
      );
    }
  });

  afterAll(async () => {
    if (!enabled) return;
    const journals = await JournalModel.find({ organizationId: org }).select('_id').lean();
    await AuditEventModel.deleteMany({ organizationId: org });
    await JournalModel.deleteMany({ _id: { $in: journals.map(j => j._id) } });
    await AccountModel.deleteMany({ organizationId: org });
    await MembershipModel.deleteMany({ organizationId: { $in: [org, otherOrg] } });
    await mongoose.disconnect();
  });
});
