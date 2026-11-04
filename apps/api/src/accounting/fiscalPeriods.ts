import type { ClientSession, Types } from 'mongoose';
import { OrganizationModel } from '../models/organization.js';
import { FiscalPeriodModel } from '../models/fiscalPeriod.js';
import { PostingError } from './postJournal.js';

function indiaDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function fiscalYearBounds(date: string, startMonth: number): { startDate: string; endDateExclusive: string } {
  const [yearText, monthText] = date.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const startYear = month >= startMonth ? year : year - 1;
  const start = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
  const endYear = startYear + (startMonth === 1 ? 1 : 1);
  const endMonth = startMonth === 1 ? 1 : startMonth;
  const endDateExclusive = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
  return { startDate: start, endDateExclusive };
}

/** Enforces the organization's open fiscal year for server-assigned India-local posting dates. */
export async function assertPostingPeriodOpen(
  organizationId: Types.ObjectId,
  session: ClientSession,
  now = new Date(),
): Promise<void> {
  const organization = await OrganizationModel.findById(organizationId).session(session)
    .select('fiscalYearStartMonth').lean<{ fiscalYearStartMonth: number } | null>();
  if (!organization) throw new PostingError('ACCOUNT', 'Organization not found');
  const date = indiaDate(now);
  const bounds = fiscalYearBounds(date, organization.fiscalYearStartMonth);
  let period = await FiscalPeriodModel.findOne({ organizationId, ...bounds }).session(session).exec();
  if (!period) {
    [period] = await FiscalPeriodModel.create([{ organizationId, ...bounds, status: 'open' }], { session });
  }
  if (period.status !== 'open') throw new PostingError('PERIOD_CLOSED', 'The current fiscal period is closed');
  const fence = await FiscalPeriodModel.updateOne(
    { _id: period._id, status: 'open' }, { $inc: { postingFence: 1 } }, { session },
  );
  if (fence.matchedCount !== 1) throw new PostingError('PERIOD_CLOSED', 'The current fiscal period is closed');
}
