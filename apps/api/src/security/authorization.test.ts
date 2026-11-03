import { describe, expect, it } from 'vitest';
import { roleAllows, type Permission } from './authorization.js';

describe('role permission policy', () => {
  const cases: Array<[string | null, Permission, boolean]> = [
    ['owner', 'organization:manage', true],
    ['admin', 'organization:manage', true],
    ['accountant', 'organization:manage', false],
    ['viewer', 'organization:manage', false],
    ['viewer', 'ledger:read', true],
    ['viewer', 'ledger:post', false],
    ['accountant', 'ledger:post', true],
    ['suspended', 'ledger:read', false],
    [null, 'organization:read', false],
  ];
  it.each(cases)('role %s has permission %s = %s', (role, permission, allowed) => {
    expect(roleAllows(role, permission)).toBe(allowed);
  });
});
