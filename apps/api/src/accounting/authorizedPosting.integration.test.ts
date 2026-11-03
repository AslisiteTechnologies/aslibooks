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
