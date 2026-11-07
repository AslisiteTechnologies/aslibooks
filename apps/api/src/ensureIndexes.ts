import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from './db.js';
import './models/account.js';
import './models/attachment.js';
import './models/auditEvent.js';
import './models/bankTransaction.js';
import './models/bill.js';
import './models/cashTransfer.js';
import './models/cashExpense.js';
import './models/contact.js';
import './models/customerAdvance.js';
import './models/fiscalPeriod.js';
import './models/invoice.js';
import './models/journal.js';
import './models/journalDraft.js';
import './models/membership.js';
import './models/openingBalance.js';
import './models/organization.js';
import './models/product.js';
import './models/receipt.js';
import './models/vendorAdvance.js';
import './models/vendorPayment.js';
import { ensureAuthRateLimitIndexes } from './security/authRateLimit.js';
import { logSafeError } from './security/safeLogger.js';
import { assertIndexTarget } from './indexConfig.js';

async function ensureIndexes() {
  const databaseName = assertIndexTarget(process.env.MONGODB_DB_NAME, process.env.ASLIBOOKS_INDEX_DATABASE);
  await connectDatabase();
  try {
    const names = mongoose.modelNames().sort();
    for (const name of names) await mongoose.model(name).createIndexes();
    await ensureAuthRateLimitIndexes();
    console.info(`Ensured declared indexes for database ${databaseName}: ${names.length} Aslibooks MongoDB models and both auth/AI rate-limit TTL collections`);
  } finally {
    await disconnectDatabase();
  }
}

ensureIndexes().catch(error => {
  logSafeError('index_preparation_failed', error);
  process.exitCode = 1;
});
