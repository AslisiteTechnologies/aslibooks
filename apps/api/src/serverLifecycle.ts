import type { Server } from 'node:http';

/** Drain active HTTP work before closing the database connections it may need. */
export function createGracefulShutdown(server: Server, cleanup: () => Promise<void>): () => Promise<void> {
  let shutdownPromise: Promise<void> | undefined;

  return () => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    }).then(cleanup, async error => {
      await cleanup();
      throw error;
    });
    return shutdownPromise;
  };
}
