/**
 * In-process mutex for serializing concurrent booking writes on the same host.
 * Guarantees mutual exclusion within a Node instance, complementing
 * PostgreSQL advisory locks (pg_advisory_xact_lock) across distributed workers.
 */
const hostLocks: Map<number, Promise<void>> = new Map<number, Promise<void>>();

export async function withHostLock<T>(hostId: number | undefined, fn: () => Promise<T>): Promise<T> {
  if (!hostId) {
    return fn();
  }

  const previousLock = hostLocks.get(hostId) ?? Promise.resolve();
  let releaseLock: (() => void) | undefined;
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  hostLocks.set(hostId, currentLock);

  try {
    await previousLock;
    return await fn();
  } finally {
    releaseLock?.();
    if (hostLocks.get(hostId) === currentLock) {
      hostLocks.delete(hostId);
    }
  }
}
