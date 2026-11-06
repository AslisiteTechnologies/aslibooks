import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountModel } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { JournalModel } from '../models/journal.js';
import { JournalDraftModel } from '../models/journalDraft.js';
import { MembershipModel } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI;
const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);

describe.skipIf(!enabled)('authenticated manual journal API', () => {
  const app = express();
  app.use(express.json());
  app.use('/orgs', organizationRouter(async headers => {
    const id = headers.get('x-fixture-actor');
    return id ? { id } : null;
  }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: String(error) });
  });
  const org = new Types.ObjectId();
  const foreignOrg = new Types.ObjectId();
  const debit = new Types.ObjectId();
  const credit = new Types.ObjectId();
  const foreignDebit = new Types.ObjectId();
  const foreignCredit = new Types.ObjectId();
  const foreignJournalId = new Types.ObjectId();
  const suffix = org.toHexString();
  const path = `/orgs/${org}/journals`;
  const valid = {
    idempotencyKey: `manual:${suffix}`,
    description: 'Opening cash adjustment',
    lines: [
      { accountId: String(debit), debitPaise: 12345, creditPaise: 0 },
      { accountId: String(credit), debitPaise: 0, creditPaise: 12345 },
    ],
  };
  const owner = { 'x-fixture-actor': 'journal-owner' };
  const accountant = { 'x-fixture-actor': 'journal-accountant' };

  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName: dbName!, serverSelectionTimeoutMS: 10000 });
    await Promise.all([
      OrganizationModel.init(), MembershipModel.init(), AccountModel.init(), JournalModel.init(),
      AuditEventModel.init(), FiscalPeriodModel.init(), JournalDraftModel.init(),
    ]);
    await OrganizationModel.create([
      { _id: org, name: 'Journal test', slug: `journal-${suffix}` },
      { _id: foreignOrg, name: 'Foreign journal test', slug: `foreign-journal-${foreignOrg}` },
    ]);
    await MembershipModel.create([
      { organizationId: org, authUserId: 'journal-owner', role: 'owner' },
      { organizationId: org, authUserId: 'journal-accountant', role: 'accountant' },
      { organizationId: org, authUserId: 'journal-viewer', role: 'viewer' },
      { organizationId: foreignOrg, authUserId: 'journal-foreign', role: 'owner' },
    ]);
    await AccountModel.create([
      { _id: debit, organizationId: org, code: `JD-${suffix}`, name: 'Cash', type: 'asset' },
      { _id: credit, organizationId: org, code: `JC-${suffix}`, name: 'Opening equity', type: 'equity' },
      { _id: foreignDebit, organizationId: foreignOrg, code: '1000', name: 'Foreign cash', type: 'asset' },
      { _id: foreignCredit, organizationId: foreignOrg, code: '3000', name: 'Foreign capital', type: 'equity' },
    ]);
    await JournalModel.create({ _id: foreignJournalId, organizationId: foreignOrg, idempotencyKey: `foreign-journal-${suffix}`,
      currency: 'INR', description: 'Foreign source journal', postedAt: new Date(), lines: [
        { accountId: foreignDebit, debitPaise: 100, creditPaise: 0 }, { accountId: foreignCredit, debitPaise: 0, creditPaise: 100 },
      ] });
  });

  it('lists, posts, reads and reverses journals with tenant and actor fences', async () => {
    await request(app).get(path).expect(401);
    await request(app).get(path).set('x-fixture-actor', 'journal-viewer').expect(200).expect(({ body }) => {
      expect(body.journals).toEqual([]);
    });
    await request(app).post(path).set(owner).send({ ...valid, actorAuthUserId: 'forged' }).expect(400);
    await request(app).post(path).set(owner).send({ ...valid, lines: [
      { ...valid.lines[0], creditPaise: 1 }, valid.lines[1],
    ] }).expect(400);
    await request(app).post(path).set({ 'x-fixture-actor': 'journal-viewer' }).send(valid).expect(403);
    const journalsBeforeForeignAccount = await JournalModel.countDocuments({ organizationId: org });
    const auditsBeforeForeignAccount = await AuditEventModel.countDocuments({ organizationId: org });
    await request(app).post(path).set(accountant).send({ ...valid, idempotencyKey: `foreign-account:${suffix}`, lines: [
      { accountId: String(foreignDebit), debitPaise: 12345, creditPaise: 0 }, valid.lines[1],
    ] }).expect(422);
    expect(await JournalModel.countDocuments({ organizationId: org })).toBe(journalsBeforeForeignAccount);
    expect(await AuditEventModel.countDocuments({ organizationId: org })).toBe(auditsBeforeForeignAccount);
    await request(app).get(`${path}/${foreignJournalId}`).set(owner).expect(404);
    const posted = await request(app).post(path).set(accountant).send(valid).expect(201);
    expect(posted.body.replayed).toBe(false);
    const replay = await request(app).post(path).set(accountant).send(valid).expect(200);
    expect(replay.body).toMatchObject({ journalId: posted.body.journalId, replayed: true });
    const detail = await request(app).get(`${path}/${posted.body.journalId}`).set('x-fixture-actor', 'journal-viewer').expect(200);
    expect(detail.body.journal.lines).toHaveLength(2);
    const page = await request(app).get(path).set('x-fixture-actor', 'journal-viewer').expect(200);
    expect(page.body.journals).toHaveLength(1);
    await request(app).get(`/orgs/${foreignOrg}/journals/${posted.body.journalId}`)
      .set('x-fixture-actor', 'journal-foreign').expect(404);
    await request(app).post(`${path}/${posted.body.journalId}/reversals`).set({ 'x-fixture-actor': 'journal-viewer' })
      .send({ idempotencyKey: `reverse:${suffix}`, reason: 'Wrong opening amount' }).expect(403);
    await request(app).post(`${path}/${posted.body.journalId}/reversals`).set(accountant)
      .send({ idempotencyKey: `reverse:${suffix}`, reason: 'Wrong opening amount' }).expect(201);
    await request(app).post(`${path}/${foreignJournalId}/reversals`).set(owner)
      .send({ idempotencyKey: `foreign-reversal-${suffix}`, reason: 'Must stay in its tenant' }).expect(400, { error: 'Original journal not found' });
    expect(await JournalModel.countDocuments({ organizationId: org })).toBe(2);
    expect(await JournalModel.findById(foreignJournalId)).toMatchObject({ organizationId: foreignOrg, reversalOf: undefined });
    const reversed = { body: await request(app).post(`${path}/${posted.body.journalId}/reversals`).set(accountant)
      .send({ idempotencyKey: `reverse:${suffix}`, reason: 'Wrong opening amount' }).expect(200).then(response => response.body) };
    const reversalDetail = await request(app).get(`${path}/${reversed.body.journalId}`).set(owner).expect(200);
    expect(reversalDetail.body.journal.reversalOf).toBe(posted.body.journalId);
    expect(reversalDetail.body.journal.lines).toEqual([
      { accountId: String(debit), debitPaise: 0, creditPaise: 12345 },
      { accountId: String(credit), debitPaise: 12345, creditPaise: 0 },
    ]);
    expect(await JournalModel.countDocuments({ organizationId: org })).toBe(2);
    expect(await AuditEventModel.countDocuments({ organizationId: org, actorAuthUserId: 'journal-accountant' })).toBe(2);
  });

  it('saves, edits, reviews, posts and replays a journal draft atomically', async () => {
    const beforeJournals = await JournalModel.countDocuments({ organizationId: org });
    const beforeAudits = await AuditEventModel.countDocuments({ organizationId: org });
    const input = { ...valid, idempotencyKey: `journal-draft:${suffix}`, lines: [
      valid.lines[0], { ...valid.lines[1], creditPaise: 10000 },
    ] };
    await request(app).post(`${path}/drafts`).set({ 'x-fixture-actor': 'journal-viewer' }).send(input).expect(403);
    await request(app).post(`${path}/drafts`).set(accountant).send({ ...input, lines: [
      { ...input.lines[0], debitPaise: 0 }, input.lines[1],
    ] }).expect(400);
    await request(app).post(`${path}/drafts`).set(accountant).send({ ...input, lines: [
      { ...input.lines[0], accountId: String(foreignDebit) }, input.lines[1],
    ] }).expect(422);
    expect(await JournalDraftModel.countDocuments({ organizationId: org, draftIdempotencyKey: input.idempotencyKey })).toBe(0);
    expect(await AuditEventModel.countDocuments({ organizationId: org })).toBe(beforeAudits);
    const foreignDraft = await request(app).post(`/orgs/${foreignOrg}/journals/drafts`).set({ 'x-fixture-actor': 'journal-foreign' })
      .send({ idempotencyKey: `foreign-draft:${suffix}`, description: 'Foreign tenant draft', lines: [
        { accountId: String(foreignDebit), debitPaise: 100, creditPaise: 0 },
        { accountId: String(foreignCredit), debitPaise: 0, creditPaise: 100 },
      ] }).expect(201);
    const foreignDraftAudits = await AuditEventModel.countDocuments({ organizationId: foreignOrg });
    await request(app).patch(`${path}/drafts/${foreignDraft.body.draftId}`).set(accountant).send({ description: 'Cross-tenant edit', lines: valid.lines }).expect(404);
    await request(app).post(`${path}/drafts/${foreignDraft.body.draftId}/post`).set(accountant).send({}).expect(404);
    expect(await JournalDraftModel.findById(foreignDraft.body.draftId).lean()).toMatchObject({ organizationId: foreignOrg, status: 'draft' });
    expect(await AuditEventModel.countDocuments({ organizationId: foreignOrg })).toBe(foreignDraftAudits);
    expect(await JournalModel.countDocuments({ organizationId: org })).toBe(beforeJournals);
    const created = await request(app).post(`${path}/drafts`).set(accountant).send(input).expect(201);
    expect(created.body).toMatchObject({ replayed: false });
    const replay = await request(app).post(`${path}/drafts`).set(accountant).send(input).expect(200);
    expect(replay.body).toMatchObject({ draftId: created.body.draftId, replayed: true });
    await request(app).post(`${path}/drafts`).set(accountant).send({ ...input, description: 'Changed details' }).expect(409);
    await MembershipModel.updateOne({ organizationId: org, authUserId: 'journal-accountant' }, { $set: { status: 'suspended' } });
    await request(app).post(`${path}/drafts`).set(accountant).send(input).expect(403);
    await MembershipModel.updateOne({ organizationId: org, authUserId: 'journal-accountant' }, { $set: { status: 'active' } });
    const page = await request(app).get(`${path}/drafts`).set({ 'x-fixture-actor': 'journal-viewer' }).expect(200);
    expect(page.body.drafts).toEqual([expect.objectContaining({ id: created.body.draftId, status: 'draft' })]);
    expect(await JournalModel.countDocuments({ organizationId: org })).toBe(beforeJournals);

    const edited = { description: 'Reviewed cash adjustment', lines: [
      { ...input.lines[0], debitPaise: 4567 }, { ...input.lines[1], creditPaise: 4567 },
    ] };
    const draftBeforeForeignAccountEdit = await JournalDraftModel.findById(created.body.draftId).lean();
    const draftAuditsBeforeForeignAccountEdit = await AuditEventModel.countDocuments({ organizationId: org });
    await request(app).patch(`${path}/drafts/${created.body.draftId}`).set(accountant).send({
      description: 'Cross-tenant account edit', lines: [
        { accountId: String(foreignDebit), debitPaise: 4567, creditPaise: 0 },
        { accountId: String(credit), debitPaise: 0, creditPaise: 4567 },
      ],
    }).expect(422);
    expect(await JournalDraftModel.findById(created.body.draftId).lean()).toEqual(draftBeforeForeignAccountEdit);
    expect(await AuditEventModel.countDocuments({ organizationId: org })).toBe(draftAuditsBeforeForeignAccountEdit);
    await request(app).patch(`${path}/drafts/${created.body.draftId}`).set(accountant).send(edited).expect(200);
    const incompletePost = await JournalDraftModel.findById(created.body.draftId);
    incompletePost!.status = 'posted';
    await expect(incompletePost!.save()).rejects.toThrow('Posted journal drafts require a source journal and posting time');
    expect(await JournalDraftModel.findById(created.body.draftId)).toMatchObject({ status: 'draft', postedJournalId: undefined });
    await request(app).post(`${path}/drafts/${created.body.draftId}/post`).set({ 'x-fixture-actor': 'journal-viewer' }).send({}).expect(403);
    expect(await JournalModel.countDocuments({ organizationId: org })).toBe(beforeJournals);
    const period = await FiscalPeriodModel.findOne({ organizationId: org, status: 'open' });
    expect(period).not.toBeNull();
    await FiscalPeriodModel.updateOne({ _id: period?._id }, { $set: { status: 'closed' } });
    await request(app).post(`${path}/drafts/${created.body.draftId}/post`).set(accountant).send({})
      .expect(409, { error: 'The current fiscal period is closed' });
    expect(await JournalDraftModel.findById(created.body.draftId)).toMatchObject({ status: 'draft', postedJournalId: undefined });
    expect(await JournalModel.countDocuments({ organizationId: org })).toBe(beforeJournals);
    expect(await AuditEventModel.countDocuments({ organizationId: org })).toBe(beforeAudits + 2);
    await FiscalPeriodModel.updateOne({ _id: period?._id }, { $set: { status: 'open' } });
    const postAttempts = await Promise.all([
      request(app).post(`${path}/drafts/${created.body.draftId}/post`).set(accountant).send({}),
      request(app).post(`${path}/drafts/${created.body.draftId}/post`).set(accountant).send({}),
    ]);
    expect(postAttempts.map(response => response.status).sort()).toEqual([200, 201]);
    const posted = postAttempts.find(response => response.status === 201);
    const postedReplay = postAttempts.find(response => response.status === 200);
    expect(posted).toBeDefined(); expect(postedReplay).toBeDefined();
    expect(posted!.body.replayed).toBe(false);
    expect(postedReplay!.body).toMatchObject({ journalId: posted!.body.journalId, replayed: true });
    const journal = await JournalModel.findById(posted!.body.journalId).lean<{
      _id: Types.ObjectId; description: string; sourceDraftId?: Types.ObjectId;
    } | null>();
    expect(journal).toMatchObject({ description: edited.description, sourceDraftId: new Types.ObjectId(created.body.draftId) });
    expect(await JournalDraftModel.findById(created.body.draftId)).toMatchObject({ status: 'posted', postedJournalId: journal?._id });
    await request(app).patch(`${path}/drafts/${created.body.draftId}`).set(accountant).send(edited).expect(404);
    expect(await JournalModel.countDocuments({ organizationId: org })).toBe(beforeJournals + 1);
    expect(await AuditEventModel.countDocuments({ organizationId: org })).toBe(beforeAudits + 4);
  });

  afterAll(async () => {
    if (!enabled) return;
    const ids = [org, foreignOrg];
    await JournalModel.collection.deleteMany({ organizationId: { $in: ids } });
    await JournalDraftModel.collection.deleteMany({ organizationId: { $in: ids } });
    await AuditEventModel.deleteMany({ organizationId: { $in: ids } });
    await FiscalPeriodModel.deleteMany({ organizationId: { $in: ids } });
    await AccountModel.deleteMany({ organizationId: { $in: ids } });
    await MembershipModel.deleteMany({ organizationId: { $in: ids } });
    await OrganizationModel.deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
  });
});
