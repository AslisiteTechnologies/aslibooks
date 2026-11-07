import { describe, expect, it } from 'vitest';
import { assertIndexTarget } from './indexConfig.js';

describe('index command database confirmation', () => {
  it('requires an explicit confirmation matching the selected database', () => {
    expect(() => assertIndexTarget('aslibooks_staging_synthetic', undefined)).toThrow('ASLIBOOKS_INDEX_DATABASE');
    expect(() => assertIndexTarget('aslibooks_staging_synthetic', 'aslibooks_local')).toThrow('ASLIBOOKS_INDEX_DATABASE');
    expect(assertIndexTarget(' aslibooks_staging_synthetic ', 'aslibooks_staging_synthetic')).toBe('aslibooks_staging_synthetic');
  });
});
