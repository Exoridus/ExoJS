import { spawn } from 'node:child_process';

/**
 * Vitest's terminal signal listener exits before async cleanup can complete.
 * Request public cancellation over IPC instead, and wait for context cleanup.
 */
export const runAffectedProcess = (entry: string, args: readonly string[]): Promise<number> =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [entry, ...args], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      detached: process.platform !== 'win32',
    });
    let interrupted = 0;
    let forcedTermination: ReturnType<typeof setTimeout> | undefined;

    const cancel = (code: number): void => {
      interrupted = code;

      if (child.connected) {
        child.send({ type: 'affected-run-cancel', code }, () => {
          // An already-finished child needs no cancellation.
        });
      }

      // A configuration hook can hang before createVitest returns a context.
      // Bound cancellation cleanup without changing any test's timeout.
      forcedTermination ??= setTimeout(() => {
        console.error('[affected-run] ERROR: cancellation cleanup did not finish within 30 seconds');

        try {
          if (process.platform !== 'win32' && child.pid) {
            process.kill(-child.pid, 'SIGKILL');
          } else {
            child.kill('SIGKILL');
          }
        } catch {
          // The child may have exited immediately before the deadline.
        }
      }, 30_000).unref();
    };

    const onInterrupt = (): void => cancel(130);
    const onTerminate = (): void => cancel(143);

    const cleanup = (): void => {
      clearTimeout(forcedTermination);
      process.removeListener('SIGINT', onInterrupt);
      process.removeListener('SIGTERM', onTerminate);
    };

    process.once('SIGINT', onInterrupt);
    process.once('SIGTERM', onTerminate);
    child.once('error', error => {
      cleanup();
      reject(error);
    });
    child.once('close', (code, signal) => {
      cleanup();
      resolvePromise(interrupted || code || (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : signal ? 1 : 0));
    });
  });

/** Register before creating Vitest so cancellation also covers configuration startup. */
export const watchAffectedCancellation = (cancel: (code: number) => void): (() => void) => {
  const onMessage = (message: unknown): void => {
    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      message.type === 'affected-run-cancel' &&
      'code' in message &&
      (message.code === 130 || message.code === 143)
    ) {
      cancel(message.code);
    }
  };

  const onDisconnect = (): void => cancel(143);

  process.on('message', onMessage);
  process.once('disconnect', onDisconnect);

  return () => {
    process.removeListener('message', onMessage);
    process.removeListener('disconnect', onDisconnect);
  };
};
