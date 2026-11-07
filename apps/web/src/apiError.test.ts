import { describe, expect, it } from 'vitest';
import { userFacingApiError } from './api';

describe('userFacingApiError', () => {
  it('replaces browser fetch failures with actionable connection guidance', () => {
    expect(userFacingApiError(new TypeError('Failed to fetch'), 'Request failed'))
      .toBe('Unable to connect to Aslibooks. Check your connection and try again.');
    expect(userFacingApiError(new Error('Failed to fetch'), 'Request failed'))
      .toBe('Unable to connect to Aslibooks. Check your connection and try again.');
  });

  it('preserves useful server errors and supplies a fallback for unknown failures', () => {
    expect(userFacingApiError(new Error('Invalid email or password'), 'Request failed'))
      .toBe('Invalid email or password');
    expect(userFacingApiError(undefined, 'Request failed')).toBe('Request failed');
  });
});
