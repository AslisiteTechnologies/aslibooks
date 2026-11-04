import mongoose from 'mongoose';

export async function connectDatabase(uri = process.env.MONGODB_URI): Promise<void> {
  if (!uri) throw new Error('MONGODB_URI must be configured');
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME, serverSelectionTimeoutMS: 10000 });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
