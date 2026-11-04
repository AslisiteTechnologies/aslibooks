import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MembershipModel } from '../models/membership.js';
import { AccountModel } from '../models/account.js';
import { JournalModel } from '../models/journal.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { LedgerAccessDenied, postAuthorizedJournal, postAuthorizedReversal } from './authorizedPosting.js';
import { fenceLedgerPermission } from '../security/authorization.js';
import { postJournal, PostingError } from './postJournal.js';
import { postReversal } from './postReversal.js';

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

  it('denies a downgraded viewer even when membership remains active', async () => {
    const key = `role-downgrade:${suffix}`;
    await MembershipModel.updateOne(
      { organizationId: org, authUserId: actor },
      { $set: { role: 'viewer' } },
    );
    try {
      await expect(postAuthorizedJournal(actor, {
        ...input, idempotencyKey: key,
      })).rejects.toBeInstanceOf(LedgerAccessDenied);
      expect(await JournalModel.countDocuments({
        organizationId: org, idempotencyKey: key,
      })).toBe(0);
    } finally {
      await MembershipModel.updateOne(
        { organizationId: org, authUserId: actor },
        { $set: { role: 'owner' } },
      );
    }
  });

  it('rejects a downgraded role inside the transaction fence', async () => {
    await MembershipModel.updateOne(
      { organizationId: org, authUserId: actor },
      { $set: { role: 'viewer' } },
    );
    const before = await MembershipModel.findOne({
      organizationId: org, authUserId: actor,
    }).lean<{ ledgerAuthorizationFence?: number }>();
    try {
      const result = await mongoose.connection.transaction(async (session) =>
        fenceLedgerPermission(actor, org.toHexString(), session));
      expect(result).toBe(false);
      const after = await MembershipModel.findOne({
        organizationId: org, authUserId: actor,
      }).lean<{ ledgerAuthorizationFence?: number }>();
      expect(after!.ledgerAuthorizationFence).toBe(before!.ledgerAuthorizationFence);
    } finally {
      await MembershipModel.updateOne(
        { organizationId: org, authUserId: actor },
        { $set: { role: 'owner' } },
      );
    }
  });

  it('blocks direct fenced journal and reversal operations for a suspended member', async () => {
    // Bypass the preliminary authorized-service check deliberately. The
    // transactional fence must independently reject both accounting paths.
    const original = await JournalModel.findOne({
      organizationId: org, idempotencyKey: input.idempotencyKey,
    });
    expect(original).toBeTruthy();
    const auditCountBefore = await AuditEventModel.countDocuments({ organizationId: org });
    const journalKey = `fenced-denied-post:${suffix}`;
    const reversalKey = `fenced-denied-reverse:${suffix}`;
    await MembershipModel.updateOne(
      { organizationId: org, authUserId: actor },
      { $set: { status: 'suspended' } },
    );
    try {
      await expect(postJournal({
        ...input, actorAuthUserId: actor, idempotencyKey: journalKey,
      }, { enforceMembershipFence: true })).rejects.toBeInstanceOf(PostingError);
      await expect(postReversal({
        organizationId: org.toHexString(),
        actorAuthUserId: actor,
        originalJournalId: String(original!._id),
        idempotencyKey: reversalKey,
        reason: 'Suspended actor cannot reverse',
      }, { enforceMembershipFence: true })).rejects.toBeInstanceOf(PostingError);
      expect(await JournalModel.countDocuments({
        organizationId: org, idempotencyKey: { $in: [journalKey, reversalKey] },
      })).toBe(0);
      expect(await AuditEventModel.countDocuments({ organizationId: org }))
        .toBe(auditCountBefore);
    } finally {
      await MembershipModel.updateOne(
        { organizationId: org, authUserId: actor },
        { $set: { status: 'active' } },
      );
    }
  });

  it('rolls back the membership fence when journal posting fails', async () => {
    const before = await MembershipModel.findOne({
      organizationId: org, authUserId: actor,
    }).lean<{ ledgerAuthorizationFence?: number }>();
    const auditCount = await AuditEventModel.countDocuments({ organizationId: org });
    const key = `fenced-rollback:${suffix}`;
    await expect(postJournal({
      ...input,
      actorAuthUserId: actor,
      idempotencyKey: key,
      lines: [
        { accountId: new Types.ObjectId().toHexString(), debitPaise: 100, creditPaise: 0 },
        { accountId: creditAccount.toHexString(), debitPaise: 0, creditPaise: 100 },
      ],
    }, { enforceMembershipFence: true })).rejects.toMatchObject({ code: 'ACCOUNT' });
    const after = await MembershipModel.findOne({
      organizationId: org, authUserId: actor,
    }).lean<{ ledgerAuthorizationFence?: number }>();
    expect(after!.ledgerAuthorizationFence).toBe(before!.ledgerAuthorizationFence);
    expect(await JournalModel.countDocuments({ organizationId: org, idempotencyKey: key })).toBe(0);
    expect(await AuditEventModel.countDocuments({ organizationId: org })).toBe(auditCount);
  });

  it('serializes a concurrent suspension behind an in-flight posting fence', async () => {
    // Hold the membership document's transactional write lock while an
    // independent connection attempts to suspend the same actor.
    const session = await mongoose.startSession();
    let suspension: Promise<unknown> | undefined;
    try {
      session.startTransaction();
      expect(await fenceLedgerPermission(actor, org.toHexString(), session)).toBe(true);
      suspension = MembershipModel.updateOne(
        { organizationId: org, authUserId: actor },
        { $set: { status: 'suspended' } },
      ).exec();
      // The revocation must not be able to commit ahead of the transaction
      // that already acquired the membership write fence.
      const observed = await Promise.race([
        suspension.then(() => 'suspended'),
        new Promise<'pending'>(resolve => setTimeout(() => resolve('pending'), 100)),
      ]);
      expect(observed).toBe('pending');
      await session.commitTransaction();
      await suspension;
      const membership = await MembershipModel.findOne({
        organizationId: org, authUserId: actor,
      }).lean<{ status: string }>();
      expect(membership!.status).toBe('suspended');
      await expect(postAuthorizedJournal(actor, {
        ...input, idempotencyKey: `post-after-race:${suffix}`,
      })).rejects.toBeInstanceOf(LedgerAccessDenied);
    } finally {
      if (session.inTransaction()) await session.abortTransaction();
      // Release the transaction lock before awaiting a queued suspension.
      if (suspension) await suspension;
      await session.endSession();
      await MembershipModel.updateOne(
        { organizationId: org, authUserId: actor },
        { $set: { status: 'active' } },
      );
    }
  });

  it('keeps a concurrent authorized journal and membership suspension consistent', async () => {
    // The winner may vary by scheduling, but posting must never succeed
    // after revocation has committed. A committed posting must be complete.
    const key = `concurrent-post-suspend:${suffix}`;
    const auditBefore = await AuditEventModel.countDocuments({ organizationId: org });
    const posting = postAuthorizedJournal(actor, {
      ...input, idempotencyKey: key,
    }).then(value => ({ ok: true as const, value }),
      error => ({ ok: false as const, error }));
    const suspension = MembershipModel.updateOne(
      { organizationId: org, authUserId: actor },
      { $set: { status: 'suspended' } },
    ).exec();
    try {
      const [outcome] = await Promise.all([posting, suspension]);
      const journals = await JournalModel.find({
        organizationId: org, idempotencyKey: key,
      }).lean();
      expect(journals.length).toBe(outcome.ok ? 1 : 0);
      if (outcome.ok) {
        expect(outcome.value.replayed).toBe(false);
        expect(String(journals[0]._id)).toBe(outcome.value.journalId);
      }
      expect(await AuditEventModel.countDocuments({ organizationId: org }))
        .toBe(auditBefore + (outcome.ok ? 1 : 0));
      await expect(postAuthorizedJournal(actor, {
        ...input, idempotencyKey: key,
      })).rejects.toBeInstanceOf(LedgerAccessDenied);
    } finally {
      await MembershipModel.updateOne(
        { organizationId: org, authUserId: actor },
        { $set: { status: 'active' } },
      );
    }
  });

  it('keeps concurrent authorized idempotent postings to one journal and audit event', async () => {
    const key = `authorized-concurrent:${suffix}`;
    const requests = await Promise.allSettled(Array.from({ length: 4 }, () =>
      postAuthorizedJournal(actor, { ...input, idempotencyKey: key }),
    ));
    const journals = await JournalModel.find({ organizationId: org, idempotencyKey: key });
    expect(journals).toHaveLength(1);
    const id = String(journals[0]._id);
    expect(await AuditEventModel.countDocuments({
      organizationId: org, resourceId: id, action: 'journal.posted',
    })).toBe(1);
    for (const request of requests) {
      if (request.status === 'fulfilled') expect(request.value.journalId).toBe(id);
    }
    // Even if competing transactions return retryable conflicts, a later
    // authorized replay must return the single committed journal.
    expect(await postAuthorizedJournal(actor, {
      ...input, idempotencyKey: key,
    })).toEqual({ journalId: id, replayed: true });
  });

  it('rejects an authorized idempotency-key collision without another audit event', async () => {
    const key = `authorized-collision:${suffix}`;
    const first = await postAuthorizedJournal(actor, { ...input, idempotencyKey: key });
    await expect(postAuthorizedJournal(actor, {
      ...input, idempotencyKey: key, description: 'Different accounting event',
    })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await JournalModel.countDocuments({
      organizationId: org, idempotencyKey: key,
    })).toBe(1);
    expect(await AuditEventModel.countDocuments({
      organizationId: org, resourceId: first.journalId, action: 'journal.posted',
    })).toBe(1);
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
