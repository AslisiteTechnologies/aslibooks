import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { AccountModel } from '../models/account.js';
import { JournalModel } from '../models/journal.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { postJournal, PostingError, type PostingCommand } from './postJournal.js';
import { postReversal } from './postReversal.js';

const uri = process.env.MONGODB_TEST_URI;
const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);
const orgA = new Types.ObjectId();
const orgB = new Types.ObjectId();
const accountA = new Types.ObjectId();
const accountB = new Types.ObjectId();
const foreignAccount = new Types.ObjectId();
const suffix = new Types.ObjectId().toHexString();
const command: PostingCommand = {
  organizationId: orgA.toHexString(),
  actorAuthUserId: 'ledger-integration-test',
  idempotencyKey: `journal:${suffix}`,
  description: 'Integration journal',
  lines: [
    { accountId: accountA.toHexString(), debitPaise: 12500, creditPaise: 0 },
    { accountId: accountB.toHexString(), debitPaise: 0, creditPaise: 12500 },
  ],
};

describe.skipIf(!enabled)('ledger posting against isolated MongoDB replica set', () => {
  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName: dbName!, serverSelectionTimeoutMS: 10000 });
    await Promise.all([AccountModel.init(), JournalModel.init(), AuditEventModel.init()]);
    await AccountModel.create([
      { _id: accountA, organizationId: orgA, code: `CASH-${suffix}`, name: 'Cash', type: 'asset' },
      { _id: accountB, organizationId: orgA, code: `SALE-${suffix}`, name: 'Sales', type: 'income' },
      { _id: foreignAccount, organizationId: orgB, code: `CASH-${suffix}`, name: 'Foreign cash', type: 'asset' },
    ]);
  });

  it('posts one balanced journal and one audit event in a transaction', async () => {
    const result = await postJournal(command);
    expect(result.replayed).toBe(false);
    const journal = await JournalModel.findById(result.journalId);
    expect(journal?.lines).toHaveLength(2);
    expect(journal?.lines.reduce((sum: number, line: { debitPaise: number }) => sum + line.debitPaise, 0)).toBe(12500);
    expect(await AuditEventModel.countDocuments({ organizationId: orgA, resourceId: result.journalId, action: 'journal.posted' })).toBe(1);
  });

  it('replays an identical idempotency key without another journal or audit event', async () => {
    const first = await JournalModel.findOne({ organizationId: orgA, idempotencyKey: command.idempotencyKey });
    const replay = await postJournal(command);
    expect(replay).toEqual({ journalId: String(first!._id), replayed: true });
    expect(await JournalModel.countDocuments({ organizationId: orgA, idempotencyKey: command.idempotencyKey })).toBe(1);
    expect(await AuditEventModel.countDocuments({ organizationId: orgA, resourceId: replay.journalId })).toBe(1);
  });

  it('rejects reusing an idempotency key for different content', async () => {
    await expect(postJournal({ ...command, description: 'Different journal' }))
      .rejects.toMatchObject({ code: 'CONFLICT' } satisfies Partial<PostingError>);
  });

  it('rejects accounts belonging to another organization and writes nothing', async () => {
    const key = `foreign:${suffix}`;
    await expect(postJournal({
      ...command, idempotencyKey: key,
      lines: [command.lines[0], { ...command.lines[1], accountId: foreignAccount.toHexString() }],
    })).rejects.toMatchObject({ code: 'ACCOUNT' } satisfies Partial<PostingError>);
    expect(await JournalModel.countDocuments({ organizationId: orgA, idempotencyKey: key })).toBe(0);
    expect(await AuditEventModel.countDocuments({ organizationId: orgA, action: 'journal.posted' })).toBe(1);
  });

  it('rolls back journal insertion if audit event creation fails', async () => {
    const key = `rollback:${suffix}`;
    const auditFailure = vi.spyOn(AuditEventModel, 'create').mockImplementationOnce(() => {
      throw new Error('Injected audit write failure');
    });
    try {
      await expect(postJournal({ ...command, idempotencyKey: key }))
        .rejects.toThrow();
    } finally {
      auditFailure.mockRestore();
    }
    expect(await JournalModel.countDocuments({ organizationId: orgA, idempotencyKey: key })).toBe(0);
    expect(await AuditEventModel.countDocuments({ organizationId: orgA, action: 'journal.posted' })).toBe(1);
  });

  it('rejects an unbalanced journal before writing any financial or audit records', async () => {
    const key = `unbalanced:${suffix}`;
    const beforeAuditCount = await AuditEventModel.countDocuments({
      organizationId: orgA, action: 'journal.posted',
    });
    await expect(postJournal({
      ...command,
      idempotencyKey: key,
      lines: [
        command.lines[0],
        { ...command.lines[1], creditPaise: 12499 },
      ],
    })).rejects.toMatchObject({ code: 'INVALID' } satisfies Partial<PostingError>);
    expect(await JournalModel.countDocuments({ organizationId: orgA, idempotencyKey: key })).toBe(0);
    expect(await AuditEventModel.countDocuments({
      organizationId: orgA, action: 'journal.posted',
    })).toBe(beforeAuditCount);
  });

  it('handles concurrent identical posting attempts without duplicate financial records', async () => {
    const key = `concurrent:${suffix}`;
    const attempts = await Promise.allSettled(Array.from({ length: 4 }, () =>
      postJournal({ ...command, idempotencyKey: key }),
    ));
    const successes = attempts.filter(result => result.status === 'fulfilled');
    expect(successes.length).toBeGreaterThanOrEqual(1);
    expect(await JournalModel.countDocuments({ organizationId: orgA, idempotencyKey: key })).toBe(1);
    const journal = await JournalModel.findOne({ organizationId: orgA, idempotencyKey: key });
    expect(await AuditEventModel.countDocuments({
      organizationId: orgA, resourceId: String(journal!._id), action: 'journal.posted',
    })).toBe(1);
    for (const result of successes) {
      if (result.status === 'fulfilled') expect(result.value.journalId).toBe(String(journal!._id));
    }
  });

  it('database rejects a second reversal of the same original journal', async () => {
    const original = await JournalModel.findOne({
      organizationId: orgA, idempotencyKey: command.idempotencyKey,
    });
    expect(original).toBeTruthy();
    const reversalBase = {
      organizationId: orgA,
      currency: 'INR',
      description: 'Reversal constraint integration test',
      lines: [
        { accountId: accountA, debitPaise: 0, creditPaise: 12500 },
        { accountId: accountB, debitPaise: 12500, creditPaise: 0 },
      ],
      postedAt: new Date(),
      reversalOf: original!._id,
    };
    await JournalModel.create({ ...reversalBase, idempotencyKey: `reversal-a:${suffix}` });
    await expect(JournalModel.create({
      ...reversalBase, idempotencyKey: `reversal-b:${suffix}`,
    })).rejects.toMatchObject({ code: 11000 });
    expect(await JournalModel.countDocuments({
      organizationId: orgA, reversalOf: original!._id,
    })).toBe(1);
  });

  it('posts an atomic reversal with swapped lines, audit, and idempotent replay', async () => {
    const original = await JournalModel.findOne({
      organizationId: orgA, idempotencyKey: command.idempotencyKey,
    });
    expect(original).toBeTruthy();
    // The earlier uniqueness test already reversed the primary journal.
    // Use a separate ordinary journal to exercise the reversal service.
    const base = await postJournal({ ...command, idempotencyKey: `reversal-source:${suffix}` });
    const request = {
      organizationId: orgA.toHexString(),
      originalJournalId: base.journalId,
      actorAuthUserId: 'ledger-integration-test',
      idempotencyKey: `reversal-service:${suffix}`,
      reason: 'Correct erroneous posting',
    };
    const first = await postReversal(request);
    expect(first.replayed).toBe(false);
    const reversal = await JournalModel.findById(first.journalId);
    expect(String(reversal?.reversalOf)).toBe(base.journalId);
    expect(reversal?.lines.map((line: { debitPaise: number; creditPaise: number }) =>
      [line.debitPaise, line.creditPaise])).toEqual([[0, 12500], [12500, 0]]);
    expect(await AuditEventModel.countDocuments({
      organizationId: orgA, resourceId: first.journalId, action: 'journal.reversed',
    })).toBe(1);
    expect(await postReversal(request)).toEqual({ journalId: first.journalId, replayed: true });
    await expect(postReversal({ ...request, idempotencyKey: `different-reversal:${suffix}` }))
      .rejects.toMatchObject({ code: 'CONFLICT' } satisfies Partial<PostingError>);
    expect(await JournalModel.countDocuments({
      organizationId: orgA, reversalOf: new Types.ObjectId(base.journalId),
    })).toBe(1);
  });

  it('concurrent reversal attempts create at most one reversal and audit event', async () => {
    const base = await postJournal({ ...command, idempotencyKey: `race-source:${suffix}` });
    const request = {
      organizationId: orgA.toHexString(),
      originalJournalId: base.journalId,
      actorAuthUserId: 'ledger-integration-test',
      idempotencyKey: `race-reversal:${suffix}`,
      reason: 'Concurrent correction',
    };
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => postReversal(request)),
    );
    expect(results.some(result => result.status === 'fulfilled')).toBe(true);
    const reversals = await JournalModel.find({
      organizationId: orgA, reversalOf: new Types.ObjectId(base.journalId),
    });
    expect(reversals).toHaveLength(1);
    const reversalId = String(reversals[0]._id);
    expect(await AuditEventModel.countDocuments({
      organizationId: orgA, resourceId: reversalId, action: 'journal.reversed',
    })).toBe(1);
    for (const result of results) {
      if (result.status === 'fulfilled') expect(result.value.journalId).toBe(reversalId);
    }
  });

  it('rolls back reversal journal when the audit write fails', async () => {
    const source = await postJournal({ ...command, idempotencyKey: `audit-source:${suffix}` });
    const request = {
      organizationId: orgA.toHexString(),
      originalJournalId: source.journalId,
      actorAuthUserId: 'ledger-integration-test',
      idempotencyKey: `audit-reversal:${suffix}`,
      reason: 'Rollback test',
    };
    const auditFailure = vi.spyOn(AuditEventModel, 'create').mockImplementation(() => {
      throw new Error('Injected reversal audit failure');
    });
    try {
      await expect(postReversal(request)).rejects.toThrow('Injected reversal audit failure');
      expect(auditFailure).toHaveBeenCalled();
    } finally {
      auditFailure.mockRestore();
    }
    expect(await JournalModel.countDocuments({
      organizationId: orgA, idempotencyKey: request.idempotencyKey,
    })).toBe(0);
    expect(await JournalModel.countDocuments({
      organizationId: orgA, reversalOf: new Types.ObjectId(source.journalId),
    })).toBe(0);
    expect(await AuditEventModel.countDocuments({
      organizationId: orgA, action: 'journal.reversed',
      resourceId: source.journalId,
    })).toBe(0);
  });

  it('rejects inactive accounts and writes nothing', async () => {
    await AccountModel.updateOne({ _id: accountB, organizationId: orgA }, { $set: { active: false } });
    const key = `inactive:${suffix}`;
    await expect(postJournal({ ...command, idempotencyKey: key }))
      .rejects.toMatchObject({ code: 'ACCOUNT' } satisfies Partial<PostingError>);
    expect(await JournalModel.countDocuments({ organizationId: orgA, idempotencyKey: key })).toBe(0);
  });

  afterAll(async () => {
    if (!enabled) return;
    await AuditEventModel.deleteMany({ organizationId: orgA, actorAuthUserId: 'ledger-integration-test' });
    await JournalModel.deleteMany({ organizationId: orgA, idempotencyKey: { $in: [
      command.idempotencyKey, `foreign:${suffix}`, `inactive:${suffix}`, `rollback:${suffix}`,
      `unbalanced:${suffix}`, `concurrent:${suffix}`,
      `reversal-a:${suffix}`, `reversal-b:${suffix}`,
      `reversal-source:${suffix}`, `reversal-service:${suffix}`,
      `race-source:${suffix}`, `race-reversal:${suffix}`,
      `audit-source:${suffix}`, `audit-reversal:${suffix}`,
    ] } });
    await AccountModel.deleteMany({ _id: { $in: [accountA, accountB, foreignAccount] } });
    await mongoose.disconnect();
  });
});
