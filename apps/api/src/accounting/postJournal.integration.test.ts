import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { AccountModel } from '../models/account.js';
import { JournalModel } from '../models/journal.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { postJournal, PostingError, type PostingCommand } from './postJournal.js';

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
      command.idempotencyKey, `foreign:${suffix}`, `inactive:${suffix}`,
    ] } });
    await AccountModel.deleteMany({ _id: { $in: [accountA, accountB, foreignAccount] } });
    await mongoose.disconnect();
  });
});
