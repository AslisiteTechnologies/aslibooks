import { rateLimit } from 'express-rate-limit';
import type { ClientRateLimitInfo, IncrementResponse, Options, Store } from 'express-rate-limit';
import { createHmac } from 'node:crypto';
import mongoose from 'mongoose';
import type { RequestHandler } from 'express';

type AuthRateLimitOptions = { windowMs?: number; limit?: number; store?: Store };
type RateLimitRecord = { _id: string; prefix: string; totalHits: number; windowStart: number; expiresAt: Date };

export class MongoAuthRateLimitStore implements Store {
  readonly localKeys = false;
  readonly prefix: string;
  private windowMs: number;
  private readonly collectionName: string;
  private readonly hashSecret: string;

  constructor(options: { windowMs?: number; prefix?: string; collectionName?: string; hashSecret: string }) {
    this.windowMs = options.windowMs ?? 15 * 60 * 1000;
    this.prefix = options.prefix ?? 'aslibooks:auth:';
    this.collectionName = options.collectionName ?? 'aslibooks_auth_rate_limits';
    this.hashSecret = options.hashSecret;
    if (!this.hashSecret) throw new Error('Rate limit key hashing requires the shared Better Auth secret');
  }

  private get collection() {
    const database = mongoose.connection.db;
    if (!database) throw new Error('MongoDB must be connected before initializing the auth rate limit store');
    return database.collection<RateLimitRecord>(this.collectionName);
  }

  async initialize() {
    await this.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'auth_rate_limit_expiry' });
  }

  async init(options: Options) {
    this.windowMs = options.windowMs;
    await this.initialize();
  }

  async increment(key: string): Promise<IncrementResponse> {
    const windowStart = Math.floor(Date.now() / this.windowMs) * this.windowMs;
    const _id = this.documentId(key, windowStart);
    try {
      await this.collection.updateOne({ _id }, { $inc: { totalHits: 1 }, $setOnInsert: {
        prefix: this.prefix, windowStart, expiresAt: new Date(windowStart + this.windowMs + 60_000),
      } }, { upsert: true });
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 11000)) throw error;
      await this.collection.updateOne({ _id }, { $inc: { totalHits: 1 } });
    }
    const row = await this.collection.findOne({ _id });
    if (!row) throw new Error('MongoDB did not persist the auth rate limit counter');
    return { totalHits: row.totalHits, resetTime: new Date(windowStart + this.windowMs) };
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const windowStart = Math.floor(Date.now() / this.windowMs) * this.windowMs;
    const row = await this.collection.findOne({ _id: this.documentId(key, windowStart) });
    return row ? { totalHits: row.totalHits, resetTime: new Date(windowStart + this.windowMs) } : undefined;
  }

  async decrement(key: string) {
    const windowStart = Math.floor(Date.now() / this.windowMs) * this.windowMs;
    await this.collection.updateOne({ _id: this.documentId(key, windowStart), totalHits: { $gt: 0 } }, { $inc: { totalHits: -1 } });
  }

  async resetKey(key: string) {
    const windowStart = Math.floor(Date.now() / this.windowMs) * this.windowMs;
    await this.collection.deleteOne({ _id: this.documentId(key, windowStart) });
  }

  async resetAll() { await this.collection.deleteMany({ prefix: this.prefix }); }

  private documentId(key: string, windowStart: number) {
    const digest = createHmac('sha256', this.hashSecret).update(key).digest('hex');
    return `${this.prefix}${windowStart}:${digest}`;
  }
}

export function createMongoAuthRateLimitStore() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required for shared auth rate limiting');
  return new MongoAuthRateLimitStore({ hashSecret: secret });
}

/**
 * Bounds password and account-management mutations. Production startup injects the shared
 * MongoDB store; omitting it keeps the built-in store available for isolated unit tests.
 */
export function createAuthRateLimiter(options: AuthRateLimitOptions = {}): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs ?? 15 * 60 * 1000,
    limit: options.limit ?? 20,
    ...(options.store ? { store: options.store } : {}),
    skip: request => request.method !== 'POST',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json({ error: 'Too many authentication requests. Try again later.' }),
  });
}
