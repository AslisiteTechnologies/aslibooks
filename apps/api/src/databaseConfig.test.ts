import { describe, expect, it } from 'vitest';
import { requireDatabaseName } from './databaseConfig.js';

describe('explicit MongoDB database configuration', () => {
  it('requires a database name instead of using the URI default', () => {
    expect(() => requireDatabaseName(undefined)).toThrow('MONGODB_DB_NAME is required');
    expect(() => requireDatabaseName('   ')).toThrow('MONGODB_DB_NAME is required');
  });

  it('returns the explicitly configured database name', () => {
    expect(requireDatabaseName(' aslibooks_local ')).toBe('aslibooks_local');
  });
});
