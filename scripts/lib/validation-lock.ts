import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

class ValidationLockBusyError extends Error {}

type LockScope = 'repository' | 'checkout';

interface LockRecord {
  pid: number;
  host?: string;
  cwd?: string;
  startedAt?: string;
  token: string;
}

/**
 * What can be proven about a lock owner. Only `dead` is positive evidence of
 * abandonment; every other state keeps the lock in place.
 *
 *   live       the PID exists on this host (a recycled PID reads as live, which only errs towards waiting)
 *   dead       this host reports no such PID
 *   foreign    the record names another host, so its PID says nothing here
 *   unreadable the record is missing, partial or malformed
 *   unknown    the liveness probe failed for a reason other than "no such process"
 */
export type LockOwnerState = 'live' | 'dead' | 'foreign' | 'unreadable' | 'unknown';

export type ProcessProbe = (pid: number) => boolean;

/** `process.kill(pid, 0)` delivers no signal; ESRCH is the only proof that a PID is gone, EPERM proves it exists. */
const probeProcess: ProcessProbe = pid => {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === 'ESRCH') {
      return false;
    }

    if (code === 'EPERM') {
      return true;
    }

    throw error;
  }
};

const readRecord = (path: string): LockRecord | undefined => {
  try {
    const record = JSON.parse(readFileSync(path, 'utf8')) as Partial<LockRecord>;

    return Number.isInteger(record.pid) && typeof record.token === 'string' ? (record as LockRecord) : undefined;
  } catch {
    return undefined;
  }
};

export const inspectLockOwner = (path: string, probe: ProcessProbe = probeProcess): { state: LockOwnerState; record?: LockRecord } => {
  const record = readRecord(path);

  if (!record) {
    return { state: 'unreadable' };
  }

  if (record.host !== undefined && record.host !== hostname()) {
    return { state: 'foreign', record };
  }

  try {
    return { state: probe(record.pid) ? 'live' : 'dead', record };
  } catch {
    return { state: 'unknown', record };
  }
};

const resolveLockPath = (cwd: string, scope: LockScope): string => {
  const git = spawnSync('git', ['rev-parse', scope === 'repository' ? '--git-common-dir' : '--git-dir'], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
  });

  if (git.status !== 0) {
    throw new Error(`Cannot resolve validation ownership: ${git.stderr || git.error?.message}`);
  }

  return resolve(cwd, git.stdout.trim(), scope === 'repository' ? 'exojs-validation.lock' : 'exojs-checkout-validation.lock');
};

const describeOwner = (state: LockOwnerState): string => {
  const advice = 'Never kill processes by name; run `pnpm validation:unlock` to see whether recovery is provably safe.';

  switch (state) {
    case 'live':
      return `The owner is still running; wait for it. ${advice}`;
    case 'dead':
      return `The owner process no longer exists on this host, so the lock looks abandoned. Check that none of its child processes still run, then run \`pnpm validation:unlock\`.`;
    case 'foreign':
      return `The owner ran on another host, so it cannot be probed from here. Confirm it is gone, then remove this exact file by hand. ${advice}`;
    default:
      return `The owner cannot be identified. Remove this exact file by hand only after confirming no validation is running. ${advice}`;
  }
};

/** Reserve shared test resources or one checkout's outputs. Stale locks are never silently stolen. */
export const acquireValidationLock = (
  cwd: string,
  scope: LockScope = 'repository',
): { path: string; release: () => void; retain: () => void } => {
  const path = resolveLockPath(cwd, scope);
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
      owner = readFileSync(path, 'utf8').trim();
    } catch {
      /* Another writer may still be publishing its owner record. */
    }

    throw new ValidationLockBusyError(`Validation already owns ${path}: ${owner}. ${describeOwner(inspectLockOwner(path).state)}`, {
      cause: error,
    });
  }

  try {
    writeFileSync(fd, `${JSON.stringify({ pid: process.pid, host: hostname(), cwd, startedAt: new Date().toISOString(), token })}\n`);
  } catch (error) {
    unlinkSync(path);

    throw error;
  } finally {
    closeSync(fd);
  }

  let released = false;

  const release = (): void => {
    if (released) {
      return;
    }

    released = true;
    process.removeListener('exit', release);

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
  };

  // `process.exit` and uncaught exceptions skip the caller's `finally`; signals are handled by the callers.
  process.once('exit', release);

  return {
    path,
    release,
    /** Keep the lock past process exit, for an owner whose cleanup could not be confirmed. */
    retain: () => {
      process.removeListener('exit', release);
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

export type RecoveryResult = { recovered: true } | { recovered: false; reason: string };

/**
 * Remove a lock whose owner is provably gone, and nothing else.
 *
 * Recovery is explicit and never part of acquisition: a lock can outlive its
 * owner's child processes, which cannot be enumerated from here, so the caller
 * confirms them first. Concurrent recoveries are serialized by a `.reclaim`
 * guard created exclusively. Inside the guard the lock is re-read and only
 * removed when it is still the record that was inspected. A new owner cannot
 * appear in between, because creating the lock requires the file to be absent,
 * and the guard's holders are the only ones that remove an owned file other than
 * the owner itself. A guard left behind by a crash blocks recovery only, never
 * acquisition, and is reported rather than removed.
 */
export const recoverValidationLock = (cwd: string, scope: LockScope = 'repository', probe: ProcessProbe = probeProcess): RecoveryResult => {
  const path = resolveLockPath(cwd, scope);
  const inspected = inspectLockOwner(path, probe);

  if (inspected.state !== 'dead' || !inspected.record) {
    return { recovered: false, reason: `Not recovering ${path}: owner state is ${inspected.state}.` };
  }

  const guardPath = `${path}.reclaim`;
  const guardToken = randomUUID();
  let guardFd: number;

  try {
    guardFd = openSync(guardPath, 'wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return {
        recovered: false,
        reason: `Another recovery holds ${guardPath}. If no recovery is running, inspect that file and remove it by hand.`,
      };
    }

    return { recovered: false, reason: `Cannot create ${guardPath}: ${(error as Error).message}` };
  }

  try {
    writeFileSync(guardFd, `${JSON.stringify({ pid: process.pid, host: hostname(), token: guardToken })}\n`);
  } finally {
    closeSync(guardFd);
  }

  try {
    const current = inspectLockOwner(path, probe);

    if (current.state !== 'dead' || current.record?.token !== inspected.record.token) {
      return { recovered: false, reason: `Not recovering ${path}: the lock changed while recovery was starting.` };
    }

    try {
      unlinkSync(path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;

      if (code !== 'ENOENT') {
        return { recovered: false, reason: `Cannot remove ${path}: ${(error as Error).message}` };
      }
    }

    return { recovered: true };
  } finally {
    try {
      unlinkSync(guardPath);
    } catch {
      /* Left for the diagnostics above; it blocks only recovery. */
    }
  }
};

const invokedPath = process.argv[1];

if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  const scope: LockScope = process.argv.includes('--checkout') ? 'checkout' : 'repository';
  const result = recoverValidationLock(process.cwd(), scope);

  console.log(result.recovered ? 'Removed the abandoned validation lock.' : result.reason);
  process.exitCode = result.recovered ? 0 : 1;
}
