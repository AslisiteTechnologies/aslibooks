export type EmailMessage = { to: string; subject: string; text: string };
export type EmailProviderConfig = { apiKey: string; from: string };

export function getEmailProviderConfig(env: NodeJS.ProcessEnv = process.env): EmailProviderConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!apiKey && !from) return null;
  if (!apiKey || !from || /[\r\n]/.test(from)) throw new Error('Configure both RESEND_API_KEY and a valid EMAIL_FROM address');
  return { apiKey, from };
}

export function emailDeliveryEnabled(): boolean { return getEmailProviderConfig() !== null; }

/** Sends transactional messages through Resend without logging secrets or content. */
export async function sendTransactionalEmail(message: EmailMessage, config = getEmailProviderConfig()): Promise<void> {
  if (!config) throw new Error('Transactional email is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, text: message.text }),
  });
  if (!response.ok) throw new Error('Transactional email delivery failed');
}

export function webApplicationUrl(env: NodeJS.ProcessEnv = process.env): string {
  const origin = env.WEB_ORIGIN?.split(',')[0]?.trim();
  if (!origin) throw new Error('WEB_ORIGIN is required to create application links');
  return new URL('/', origin).toString();
}
