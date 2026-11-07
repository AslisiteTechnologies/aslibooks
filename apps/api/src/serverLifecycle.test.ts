import type { Server } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { createGracefulShutdown } from './serverLifecycle.js';

describe('graceful API shutdown', () => {
  it('waits for HTTP server draining before closing databases and reuses the shutdown promise', async () => {
    let finishDraining: ((error?: Error) => void) | undefined;
    const server = {
      close: vi.fn((callback: (error?: Error) => void) => { finishDraining = callback; }),
    } as unknown as Server;
    const order: string[] = [];
    const shutdown = createGracefulShutdown(server, async () => { order.push('database connections closed'); });

    const firstCall = shutdown();
    const repeatedCall = shutdown();

    expect(repeatedCall).toBe(firstCall);
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(order).toEqual([]);

    finishDraining?.();
    await firstCall;

    expect(order).toEqual(['database connections closed']);
  });

  it('closes database connections even if the HTTP server reports a close error', async () => {
    const server = {
      close: (callback: (error?: Error) => void) => callback(new Error('server close failed')),
    } as unknown as Server;
    const cleanup = vi.fn(async () => undefined);

    await expect(createGracefulShutdown(server, cleanup)()).rejects.toThrow('server close failed');
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
