import { describe, expect, it } from 'vitest';
import { assertMigrationTarget } from './config.js';

describe('migration target confirmation', () => {
  it('accepts only the exact configured database name', () => {
    expect(() => assertMigrationTarget('aslibooks_test_migrations', 'aslibooks_test_migrations')).not.toThrow();
  });

  it('rejects a missing database name or a mismatched confirmation', () => {
    expect(() => assertMigrationTarget(undefined, 'aslibooks_test_migrations')).toThrow('MONGODB_DB_NAME');
    expect(() => assertMigrationTarget('aslibooks_test_migrations', undefined)).toThrow('exact target database name');
    expect(() => assertMigrationTarget('aslibooks_test_migrations', 'aslibooks_production')).toThrow('exact target database name');
  });
});
