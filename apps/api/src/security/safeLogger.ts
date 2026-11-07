export type SafeErrorEvent = 'api_request_failed' | 'api_startup_failed' | 'api_shutdown_failed' | 'index_preparation_failed' | 'migration_failed' | 'auth_email_delivery_failed';

/** Log only fixed event metadata; exception messages and stacks may contain secrets or financial data. */
export function logSafeError(event: SafeErrorEvent, error: unknown): void {
  console.error(JSON.stringify({
    event,
    errorType: error instanceof Error ? 'Error' : typeof error,
  }));
}
