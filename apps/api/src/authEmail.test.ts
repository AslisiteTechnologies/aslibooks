import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendAuthEmailInBackground } from './authEmail.js';

describe('background authentication email delivery', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps delivery failures observable without logging recipient or reset-link data', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sendAuthEmailInBackground(async () => { throw new Error('recipient user@example.test reset token=secret-token'); });

    await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(1));
    expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'auth_email_delivery_failed', errorType: 'Error' }));
    expect(String(log.mock.calls[0]?.[0])).not.toMatch(/user@example|secret-token/);
  });
});
