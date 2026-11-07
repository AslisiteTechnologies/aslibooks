import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEmailProviderConfig, sendTransactionalEmail, webApplicationUrl } from './email.js';

afterEach(() => vi.unstubAllGlobals());

describe('transactional email configuration and delivery', () => {
  it('leaves email disabled when no provider variables are configured', () => {
    expect(getEmailProviderConfig({})).toBeNull();
  });

  it('rejects incomplete or header-injected sender configuration', () => {
    expect(() => getEmailProviderConfig({ RESEND_API_KEY: 'configured' } as NodeJS.ProcessEnv)).toThrow();
    expect(() => getEmailProviderConfig({ RESEND_API_KEY: 'configured', EMAIL_FROM: 'sender@example.com\r\nBcc: attacker@example.com' } as NodeJS.ProcessEnv)).toThrow();
  });

  it('sends an email with the configured sender and never surfaces provider response details', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await sendTransactionalEmail({ to: 'member@example.com', subject: 'Verify', text: 'Use the secure link' },
      { apiKey: 'test-secret-value', from: 'Aslibooks <no-reply@example.com>' });
    expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer test-secret-value' }),
    }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ to: ['member@example.com'], from: 'Aslibooks <no-reply@example.com>', subject: 'Verify' });
    fetchMock.mockResolvedValueOnce(new Response('secret provider detail', { status: 503 }));
    await expect(sendTransactionalEmail({ to: 'member@example.com', subject: 'Verify', text: 'x' },
      { apiKey: 'test-secret-value', from: 'no-reply@example.com' })).rejects.toThrow('Transactional email delivery failed');
  });

  it('uses only the configured web origin when generating links', () => {
    expect(webApplicationUrl({ WEB_ORIGIN: 'https://app.example.com,https://admin.example.com' } as NodeJS.ProcessEnv)).toBe('https://app.example.com/');
    expect(() => webApplicationUrl({})).toThrow();
  });
});
