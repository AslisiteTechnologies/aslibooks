import { describe, expect, it } from 'vitest';
import { createOrganizationSchema } from './organizationValidation.js';

describe('organization input validation', () => {
  it('accepts and normalizes valid input', () => {
    expect(createOrganizationSchema.parse({ name: '  Sample Shop  ', slug: 'SAMPLE-SHOP' })).toEqual({ name: 'Sample Shop', slug: 'sample-shop' });
  });
  it.each([
    { name: '', slug: 'valid' },
    { name: 'Shop', slug: 'a' },
    { name: 'Shop', slug: 'invalid slug' },
    { name: 'Shop', slug: 'valid', role: 'owner' },
    { name: 'Shop', slug: 'valid', organizationId: 'other-company' },
  ])('rejects invalid or injected fields: %j', (input) => {
    expect(createOrganizationSchema.safeParse(input).success).toBe(false);
  });
});
