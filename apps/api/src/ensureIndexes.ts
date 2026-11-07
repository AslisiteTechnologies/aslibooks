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
import { logSafeError } from './security/safeLogger.js';

async function ensureIndexes() {
  await connectDatabase();
  try {
    const names = mongoose.modelNames().sort();
    for (const name of names) await mongoose.model(name).createIndexes();
    console.info(`Ensured declared indexes for ${names.length} Aslibooks MongoDB models: ${names.join(', ')}`);
  } finally {
    await disconnectDatabase();
  }
}

ensureIndexes().catch(error => {
  logSafeError('index_preparation_failed', error);
  process.exitCode = 1;
});
