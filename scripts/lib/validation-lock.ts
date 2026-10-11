import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** One local lane runner per repository, including linked worktrees. Stale locks are never silently stolen. */
export const acquireValidationLock = (cwd: string): { path: string; release: () => void } => {
  const git = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8', timeout: 30_000 });

  if (git.status !== 0) {
    throw new Error(`Cannot resolve validation ownership: ${git.stderr || git.error?.message}`);
  }

  const path = resolve(cwd, git.stdout.trim(), 'exojs-validation.lock');
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

    throw new Error(
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
