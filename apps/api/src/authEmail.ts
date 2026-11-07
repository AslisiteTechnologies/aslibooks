import { logSafeError } from './security/safeLogger.js';

/** Keep auth responses independent of email delivery while making provider failures observable. */
export function sendAuthEmailInBackground(send: () => Promise<void>): void {
  void send().catch(error => logSafeError('auth_email_delivery_failed', error));
}
