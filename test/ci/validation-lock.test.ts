import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  acquireValidationLock,
  inspectLockOwner,
  recoverValidationLock,
  waitForValidationLock,
} from '../../scripts/lib/validation-lock.ts';

const git = (cwd: string, ...args: string[]): void => {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
};

let root: string;
let lockPath: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'exojs-lock-')));
  git(root, 'init', '-q');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
  lockPath = join(root, '.git', 'exojs-validation.lock');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const writeOwner = (record: Record<string, unknown>): void => {
  writeFileSync(lockPath, `${JSON.stringify({ token: 'abandoned', ...record })}\n`);
};

const deadPid = (): number => {
  const child = spawnSync(process.execPath, ['-e', '0']);

  return child.pid;
};

describe('validation lock ownership', () => {
  it('is exclusive and released only by its own token', () => {
    const first = acquireValidationLock(root);

    expect(() => acquireValidationLock(root)).toThrow(/already owns/);

    writeOwner({ pid: process.pid, token: 'someone-else' });
    first.release();
    expect(existsSync(lockPath)).toBe(true);
  });

  it('shares one repository lock across linked worktrees but not the checkout lock', () => {
    const linked = join(root, 'linked');
    git(root, 'worktree', 'add', '-q', '-b', 'linked', linked);

    const held = acquireValidationLock(root);

    expect(() => acquireValidationLock(linked)).toThrow(/already owns/);
    expect(() => acquireValidationLock(linked, 'checkout')).not.toThrow();
    held.release();
  });

  it('writes the owner host so a foreign record is never probed', () => {
    const held = acquireValidationLock(root);
    const record = JSON.parse(readFileSync(lockPath, 'utf8')) as { pid: number; host: string };

    expect(record.pid).toBe(process.pid);
    expect(record.host).not.toBe('');
    held.release();
  });
});

describe('owner inspection', () => {
  it('reports a running process as live', () => {
    writeOwner({ pid: process.pid });
    expect(inspectLockOwner(lockPath).state).toBe('live');
  });

  it('reports an exited process as dead', () => {
    writeOwner({ pid: deadPid() });
    expect(inspectLockOwner(lockPath).state).toBe('dead');
  });

  it('does not treat an unexpected probe failure as death', () => {
    writeOwner({ pid: 1 });
    expect(
      inspectLockOwner(lockPath, () => {
        throw Object.assign(new Error('denied'), { code: 'EPERM' });
      }).state,
    ).toBe('unknown');
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('reads a process owned by another user as live', () => {
    writeOwner({ pid: 1 });
    expect(inspectLockOwner(lockPath).state).toBe('live');
  });

  it('does not probe a record from another host', () => {
    writeOwner({ pid: deadPid(), host: 'some-other-host' });
    expect(inspectLockOwner(lockPath, () => false).state).toBe('foreign');
  });

  it.each(['', '{', '{"pid":"x","token":1}', 'null'])('treats the record %j as unreadable', content => {
    writeFileSync(lockPath, content);
    expect(inspectLockOwner(lockPath).state).toBe('unreadable');
  });
});

describe('recovery', () => {
  it('removes a lock whose owner is gone and lets the next run acquire it', () => {
    writeOwner({ pid: deadPid() });

    expect(recoverValidationLock(root)).toEqual({ recovered: true });
    expect(existsSync(lockPath)).toBe(false);
    expect(existsSync(`${lockPath}.reclaim`)).toBe(false);
    acquireValidationLock(root).release();
  });

  it('never removes the lock of a running owner', () => {
    const held = acquireValidationLock(root);

    expect(recoverValidationLock(root)).toMatchObject({ recovered: false });
    expect(existsSync(lockPath)).toBe(true);
    held.release();
  });

  it.each([
    ['foreign host', { pid: 999_999, host: 'other-host' }],
    ['unreadable record', undefined],
  ])('leaves a lock with %s for manual inspection', (_name, record) => {
    if (record) {
      writeOwner(record);
    } else {
      writeFileSync(lockPath, '{');
    }

    expect(recoverValidationLock(root, 'repository', () => false)).toMatchObject({ recovered: false });
    expect(existsSync(lockPath)).toBe(true);
  });

  it('keeps a lock that a new owner took over while recovery was starting', () => {
    writeOwner({ pid: deadPid(), token: 'old' });
    let probes = 0;

    // The first probe sees the old record; the lock is then replaced before the
    // guarded re-check, which must compare against the new owner.
    const result = recoverValidationLock(root, 'repository', pid => {
      probes += 1;

      if (probes === 1) {
        writeOwner({ pid: process.pid, token: 'new' });

        return false;
      }

      return pid === process.pid;
    });

    expect(result).toMatchObject({ recovered: false });
    expect(JSON.parse(readFileSync(lockPath, 'utf8'))).toMatchObject({ token: 'new' });
    expect(existsSync(`${lockPath}.reclaim`)).toBe(false);
  });

  it('serializes concurrent recoveries on the guard and leaves a foreign guard alone', () => {
    writeOwner({ pid: deadPid() });
    writeFileSync(`${lockPath}.reclaim`, '{"pid":1,"token":"other"}\n');

    expect(recoverValidationLock(root)).toMatchObject({ recovered: false, reason: expect.stringContaining('.reclaim') });
    expect(existsSync(lockPath)).toBe(true);
    expect(existsSync(`${lockPath}.reclaim`)).toBe(true);
  });

  it('does not let an orphaned guard block acquisition of a free lock', () => {
    writeFileSync(`${lockPath}.reclaim`, '{"pid":1,"token":"orphan"}\n');

    expect(() => acquireValidationLock(root).release()).not.toThrow();
  });

  it('reports an unremovable lock instead of throwing', () => {
    mkdirSync(lockPath);
    expect(recoverValidationLock(root, 'repository', () => false)).toMatchObject({ recovered: false });
  });
});

describe('waiting', () => {
  it('names a dead owner and the recovery command, then aborts without touching the lock', async () => {
    writeOwner({ pid: deadPid() });
    const controller = new AbortController();
    const messages: string[] = [];

    const waiting = waitForValidationLock(root, controller.signal, message => {
      messages.push(message);
      controller.abort();
    });

    await expect(waiting).rejects.toThrow();
    expect(messages[0]).toContain('pnpm validation:unlock');
    expect(existsSync(lockPath)).toBe(true);
  });

  it('tells the user to wait for a running owner', async () => {
    const held = acquireValidationLock(root);
    const controller = new AbortController();
    const messages: string[] = [];

    await expect(
      waitForValidationLock(root, controller.signal, message => {
        messages.push(message);
        controller.abort();
      }),
    ).rejects.toThrow();
    expect(messages[0]).toContain('still running');
    held.release();
  });
});

describe('exit safety net', () => {
  const run = (body: string): void => {
    const child = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { acquireValidationLock } from ${JSON.stringify(pathToFileURL(join(process.cwd(), 'scripts/lib/validation-lock.ts')).href)};
const lock = acquireValidationLock(${JSON.stringify(root)});
console.log('held');
${body}`,
      ],
      { encoding: 'utf8' },
    );

    // A child that never took the lock would make every assertion below vacuous.
    expect(`${child.stdout}${child.stderr}`).toContain('held');
  };

  it('releases the lock when the owner calls process.exit', () => {
    run('process.exit(3);');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('releases the lock after an uncaught exception', () => {
    run("throw new Error('boom');");
    expect(existsSync(lockPath)).toBe(false);
  });

  it('keeps a retained lock past exit', () => {
    run('lock.retain(); process.exit(0);');
    expect(existsSync(lockPath)).toBe(true);
  });
});
