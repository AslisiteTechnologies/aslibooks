import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { postAuthorizedJournal } from '../accounting/authorizedPosting.js';
import { AccountModel } from '../models/account.js';
import { AuditEventModel } from '../models/auditEvent.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { JournalModel } from '../models/journal.js';
import { MembershipModel } from '../models/membership.js';
import { OrganizationModel } from '../models/organization.js';
import { organizationRouter } from './organizations.js';

const uri = process.env.MONGODB_TEST_URI;
const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);

describe.skipIf(!enabled)('ledger and trial balance reports', () => {
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
  const cash = new Types.ObjectId();
  const equity = new Types.ObjectId();
  const income = new Types.ObjectId();
  const expense = new Types.ObjectId();
  const suffix = org.toHexString();
  const path = `/orgs/${org}/reports`;

  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName: dbName!, serverSelectionTimeoutMS: 10000 });
    await Promise.all([
      OrganizationModel.init(), MembershipModel.init(), AccountModel.init(), JournalModel.init(),
      AuditEventModel.init(), FiscalPeriodModel.init(),
    ]);
    await OrganizationModel.create({ _id: org, name: 'Reports integration', slug: `reports-${suffix}` });
    await MembershipModel.create([
      { organizationId: org, authUserId: 'reports-owner', role: 'owner' },
      { organizationId: org, authUserId: 'reports-viewer', role: 'viewer' },
    ]);
    await AccountModel.create([
      { _id: cash, organizationId: org, code: `RC-${suffix}`, name: 'Cash', type: 'asset' },
      { _id: equity, organizationId: org, code: `RE-${suffix}`, name: 'Equity', type: 'equity' },
      { _id: income, organizationId: org, code: `RI-${suffix}`, name: 'Sales income', type: 'income' },
      { _id: expense, organizationId: org, code: `RX-${suffix}`, name: 'Rent expense', type: 'expense' },
    ]);
    const post = (key: string, description: string, lines: Array<{ accountId: Types.ObjectId; debitPaise: number; creditPaise: number }>) =>
      postAuthorizedJournal('reports-owner', {
        organizationId: String(org), idempotencyKey: `${key}:${suffix}`, description,
        lines: lines.map(line => ({ ...line, accountId: String(line.accountId) })),
      });
    await post('opening', 'Opening balance', [
      { accountId: cash, debitPaise: 10000, creditPaise: 0 }, { accountId: equity, debitPaise: 0, creditPaise: 10000 },
    ]);
    await post('sale', 'Cash sale', [
      { accountId: cash, debitPaise: 3500, creditPaise: 0 }, { accountId: income, debitPaise: 0, creditPaise: 3500 },
    ]);
    await post('rent', 'Rent payment', [
      { accountId: expense, debitPaise: 1200, creditPaise: 0 }, { accountId: cash, debitPaise: 0, creditPaise: 1200 },
    ]);
  });

  it('returns a balanced trial balance and paginated general ledger with correct cumulative balances', async () => {
    await request(app).get(`${path}/trial-balance`).expect(401);
    await request(app).get(`${path}/trial-balance?asOf=not-a-date`).set('x-fixture-actor', 'reports-viewer').expect(400);
    const trial = await request(app).get(`${path}/trial-balance`).set('x-fixture-actor', 'reports-viewer').expect(200);
    expect(trial.body.balanced).toBe(true);
    expect(trial.body.debitTotalPaise).toBe(13500);
    expect(trial.body.creditTotalPaise).toBe(13500);
    expect(trial.body.accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: String(cash), debitBalancePaise: 12300, creditBalancePaise: 0 }),
      expect.objectContaining({ accountId: String(equity), debitBalancePaise: 0, creditBalancePaise: 10000 }),
      expect.objectContaining({ accountId: String(income), debitBalancePaise: 0, creditBalancePaise: 3500 }),
      expect.objectContaining({ accountId: String(expense), debitBalancePaise: 1200, creditBalancePaise: 0 }),
    ]));
    const profitLoss = await request(app).get(`${path}/profit-and-loss`).set('x-fixture-actor', 'reports-viewer').expect(200);
    expect(profitLoss.body.totalIncomePaise).toBe(3500);
    expect(profitLoss.body.totalExpensesPaise).toBe(1200);
    expect(profitLoss.body.netProfitPaise).toBe(2300);
    const balanceSheet = await request(app).get(`${path}/balance-sheet`).set('x-fixture-actor', 'reports-viewer').expect(200);
    expect(balanceSheet.body).toMatchObject({
      totalAssetsPaise: 12300, totalLiabilitiesPaise: 0, totalEquityPaise: 10000,
      currentEarningsPaise: 2300, liabilitiesAndEquityPaise: 12300, balanced: true,
    });
    const query = `accountId=${cash}&limit=1`;
    const first = await request(app).get(`${path}/general-ledger?${query}`).set('x-fixture-actor', 'reports-viewer').expect(200);
    expect(first.body.entries).toHaveLength(1);
    expect(first.body.entries[0].runningBalancePaise).toBe(10000);
    let cursor = first.body.next as string;
    const running: number[] = [first.body.entries[0].runningBalancePaise];
    while (cursor) {
      const page = await request(app).get(`${path}/general-ledger?${query}&after=${encodeURIComponent(cursor)}`)
        .set('x-fixture-actor', 'reports-viewer').expect(200);
      running.push(...page.body.entries.map((entry: { runningBalancePaise: number }) => entry.runningBalancePaise));
      cursor = page.body.next;
    }
    expect(running).toEqual([10000, 13500, 12300]);
    await request(app).get(`${path}/general-ledger?accountId=${new Types.ObjectId()}`).set('x-fixture-actor', 'reports-viewer').expect(404);
  });

  afterAll(async () => {
    if (!enabled) return;
    await JournalModel.collection.deleteMany({ organizationId: org });
    await AuditEventModel.deleteMany({ organizationId: org });
    await FiscalPeriodModel.deleteMany({ organizationId: org });
    await AccountModel.deleteMany({ organizationId: org });
    await MembershipModel.deleteMany({ organizationId: org });
    await OrganizationModel.deleteOne({ _id: org });
    await mongoose.disconnect();
  });
});
