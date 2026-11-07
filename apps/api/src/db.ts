import mongoose from 'mongoose';
import { requireDatabaseName } from './databaseConfig.js';

export async function connectDatabase(uri = process.env.MONGODB_URI): Promise<void> {
  if (!uri) throw new Error('MONGODB_URI must be configured');
  const databaseName = requireDatabaseName(process.env.MONGODB_DB_NAME);
  await mongoose.connect(uri, { dbName: databaseName, serverSelectionTimeoutMS: 10000 });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
