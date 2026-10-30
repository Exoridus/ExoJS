import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

class ValidationLockBusyError extends Error {}

/** Reserve shared test resources or one checkout's outputs. Stale locks are never silently stolen. */
export const acquireValidationLock = (
  cwd: string,
  scope: 'repository' | 'checkout' = 'repository',
): { path: string; release: () => void } => {
  const git = spawnSync('git', ['rev-parse', scope === 'repository' ? '--git-common-dir' : '--git-dir'], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
  });

  if (git.status !== 0) {
    throw new Error(`Cannot resolve validation ownership: ${git.stderr || git.error?.message}`);
  }

  const path = resolve(cwd, git.stdout.trim(), scope === 'repository' ? 'exojs-validation.lock' : 'exojs-checkout-validation.lock');
  const token = randomUUID();
  let fd: number;

  try {
    fd = openSync(path, 'wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }

    let owner = 'owner record not readable';

    try {
      owner = readFileSync(path, 'utf8');
    } catch {
      /* Another writer may still be publishing its owner record. */
    }

    throw new ValidationLockBusyError(
      `Validation already owns ${path}: ${owner}. Do not kill processes by name. For an abandoned lock, inspect its PID and descendants before removing this exact file.`,
      { cause: error },
    );
  }

  try {
    writeFileSync(fd, `${JSON.stringify({ pid: process.pid, cwd, startedAt: new Date().toISOString(), token })}\n`);
  } catch (error) {
    unlinkSync(path);

    throw error;
  } finally {
    closeSync(fd);
  }

  let released = false;

  return {
    path,
    release: () => {
      if (released) {
        return;
      }

      released = true;

      try {
        const owner = JSON.parse(readFileSync(path, 'utf8')) as { token?: string };

        if (owner.token === token) {
          unlinkSync(path);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    },
  };
};

/** Wait for release without stealing ownership, including records left by a crash. Abort never removes another runner's lock. */
export const waitForValidationLock = async (
  cwd: string,
  signal: AbortSignal,
  onWait: (owner: string) => void,
  scope: 'repository' | 'checkout' = 'repository',
): Promise<ReturnType<typeof acquireValidationLock>> => {
  let lastOwner: string | undefined;

  for (;;) {
    signal.throwIfAborted();

    try {
      return acquireValidationLock(cwd, scope);
    } catch (error) {
      if (!(error instanceof ValidationLockBusyError)) {
        throw error;
      }

      if (error.message !== lastOwner) {
        lastOwner = error.message;
        onWait(error.message);
      }
    }

    await delay(500, undefined, { signal });
  }
};
