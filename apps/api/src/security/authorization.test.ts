import { describe, expect, it } from 'vitest';
import { roleAllows, type Permission } from './authorization.js';

describe('role permission policy', () => {
  const cases: Array<[string | null, Permission, boolean]> = [
    ['owner', 'organization:read', true], ['owner', 'organization:manage', true], ['owner', 'ledger:read', true], ['owner', 'ledger:post', true],
    ['admin', 'organization:read', true], ['admin', 'organization:manage', true], ['admin', 'ledger:read', true], ['admin', 'ledger:post', true],
    ['accountant', 'organization:read', true], ['accountant', 'organization:manage', false], ['accountant', 'ledger:read', true], ['accountant', 'ledger:post', true],
    ['viewer', 'organization:read', true], ['viewer', 'organization:manage', false], ['viewer', 'ledger:read', true], ['viewer', 'ledger:post', false],
    ['suspended', 'organization:read', false], ['suspended', 'organization:manage', false], ['suspended', 'ledger:read', false], ['suspended', 'ledger:post', false],
    [null, 'organization:read', false], [null, 'organization:manage', false], [null, 'ledger:read', false], [null, 'ledger:post', false],
    ['unknown-role', 'organization:read', false], ['unknown-role', 'organization:manage', false], ['unknown-role', 'ledger:read', false], ['unknown-role', 'ledger:post', false],
  ];
  it.each(cases)('role %s has permission %s = %s', (role, permission, allowed) => {
    expect(roleAllows(role, permission)).toBe(allowed);
  });
});
