import { afterEach, describe, expect, it, vi } from 'vitest';
import { logSafeError } from './safeLogger.js';

describe('safe error logging', () => {
  afterEach(() => vi.restoreAllMocks());

  it('omits exception messages and stack traces from request and startup logs', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('Bearer secret-value; account balance ₹12345; customer@example.test');
    error.stack = 'secret stack contents';

    logSafeError('api_request_failed', error);
    logSafeError('api_startup_failed', { message: 'mongodb://user:password@host/private-db' });

    expect(log).toHaveBeenCalledTimes(2);
    const lines = log.mock.calls.map(([line]) => String(line));
    expect(lines).toEqual([
      JSON.stringify({ event: 'api_request_failed', errorType: 'Error' }),
      JSON.stringify({ event: 'api_startup_failed', errorType: 'object' }),
    ]);
    expect(lines.join('\n')).not.toMatch(/secret-value|12345|customer@example|secret stack|password|private-db/);
  });
});
