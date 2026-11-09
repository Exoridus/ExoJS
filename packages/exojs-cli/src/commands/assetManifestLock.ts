import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';

import { CliError } from '../CliError.js';

const OWNER_FILE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.json$/;
const WAIT_MS = 10_000;
const POLL_MS = 25;

const errorCode = (error: unknown): string | undefined => (error as NodeJS.ErrnoException).code;

/** Empty means ownership has already ended; a successor is always nonempty. */
const removeEmptyLock = (path: string): void => {
  try {
    rmdirSync(path);
  } catch (error: unknown) {
    const code = errorCode(error);

    if (code !== 'ENOENT' && code !== 'ENOTEMPTY' && code !== 'EEXIST') {
      throw error;
    }
  }
};

const releaseOwner = (path: string, ownerFile: string): void => {
  try {
    unlinkSync(join(path, ownerFile));
  } catch (error: unknown) {
    if (errorCode(error) !== 'ENOENT') {
      throw error;
    }
  }

  // Never recursively remove or rename the canonical directory: another
  // process may have installed its own, differently named marker by now.
  removeEmptyLock(path);
};

const reclaimAbandonedLock = (path: string): void => {
  let entries: string[];

  try {
    entries = readdirSync(path);
  } catch (error: unknown) {
    if (errorCode(error) === 'ENOENT') {
      return;
    }

    throw error;
  }

  if (entries.length === 0) {
    removeEmptyLock(path);

    return;
  }

  const ownerFile = entries[0];

  if (entries.length !== 1 || ownerFile === undefined || !OWNER_FILE.test(ownerFile)) {
    return;
  }

  let owner: unknown;

  try {
    owner = JSON.parse(readFileSync(join(path, ownerFile), 'utf8'));
  } catch (error: unknown) {
    if (error instanceof SyntaxError || errorCode(error) === 'ENOENT') {
      return;
    }

    throw error;
  }

  if (typeof owner !== 'object' || owner === null || !('pid' in owner) || !('hostname' in owner)) {
    return;
  }

  if (owner.hostname !== hostname() || typeof owner.pid !== 'number' || !Number.isInteger(owner.pid) || owner.pid <= 0) {
    return;
  }

  try {
    process.kill(owner.pid, 0);
  } catch (error: unknown) {
    // An old timestamp is not proof: a paused process still owns its lock.
    // EPERM, an unknown host and PID reuse all conservatively retain it.
    if (errorCode(error) === 'ESRCH') {
      releaseOwner(path, ownerFile);
    }
  }
};

const acquire = (manifestPath: string): { path: string; token: string; ownerFile: string } => {
  const path = `${manifestPath}.lock`;
  const token = randomUUID();
  const ownerFile = `${token}.json`;
  let candidate: string | undefined;

  try {
    const prepared = mkdtempSync(`${path}-`);

    candidate = prepared;
    writeFileSync(join(prepared, ownerFile), `${JSON.stringify({ pid: process.pid, hostname: hostname() })}\n`, { flag: 'wx' });

    const deadline = performance.now() + WAIT_MS;
    const sleeper = new Int32Array(new SharedArrayBuffer(4));

    for (;;) {
      try {
        // Publish the complete owner record at once. Directory rename cannot
        // replace a nonempty directory on POSIX or an existing one on Windows.
        renameSync(prepared, path);
        candidate = undefined;

        return { path, token, ownerFile };
      } catch (error: unknown) {
        const code = errorCode(error);

        if (code !== 'EEXIST' && code !== 'ENOTEMPTY' && code !== 'EPERM' && code !== 'EACCES') {
          throw error;
        }

        reclaimAbandonedLock(path);

        if (performance.now() >= deadline) {
          throw new CliError(`timed out waiting for asset manifest lock "${path}"`, {
            hint: 'Wait for the other packer to finish. Inspect the owner record before manually removing a lock whose process cannot be verified.',
            cause: error,
          });
        }

        Atomics.wait(sleeper, 0, 0, POLL_MS);
      }
    }
  } catch (error: unknown) {
    if (error instanceof CliError) {
      throw error;
    }

    throw new CliError(`cannot lock asset manifest "${manifestPath}"`, {
      hint: 'Create the manifest directory first and check its permissions.',
      cause: error,
    });
  } finally {
    if (candidate !== undefined) {
      try {
        rmSync(candidate, { recursive: true, force: true });
      } catch {
        // Only this private candidate is disposable; retain the actual error.
      }
    }
  }
};

/** Serialize a synchronous manifest transaction between cooperating local processes. */
export const withAssetManifestLock = <T>(manifestPath: string, write: (token: string) => T): T => {
  const lock = acquire(manifestPath);
  let result: T;
  let releaseError: CliError | undefined;

  try {
    result = write(lock.token);
  } finally {
    try {
      releaseOwner(lock.path, lock.ownerFile);
    } catch (error: unknown) {
      releaseError = new CliError(`cannot release asset manifest lock "${lock.path}"`, { cause: error });
    }
  }

  // A failed transaction keeps its own diagnosis even if release also fails.
  if (releaseError !== undefined) {
    throw releaseError;
  }

  return result;
};
