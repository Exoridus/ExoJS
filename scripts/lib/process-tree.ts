import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const signalGroup = (group: number, signal: NodeJS.Signals): string | undefined => {
  try {
    process.kill(-group, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      return String(error);
    }
  }

  return undefined;
};

/** Snapshot only descendants of the child we started, including nested supervisors' process groups. */
const ownedGroups = (root: number): number[] => {
  const groups = new Set([root]);
  const snapshot = spawnSync('ps', ['-A', '-o', 'pid=,ppid=,pgid='], { encoding: 'utf8', timeout: 1000 });

  if (snapshot.status !== 0) {
    return [...groups];
  }

  const rows = snapshot.stdout
    .trim()
    .split('\n')
    .map(line => line.trim().split(/\s+/).map(Number));
  const descendants = new Set([root]);
  let changed = true;

  while (changed) {
    changed = false;

    for (const [pid, parent, group] of rows) {
      if (pid && parent && group && descendants.has(parent) && !descendants.has(pid)) {
        descendants.add(pid);

        // A descendant's inherited group may belong to an ancestor outside our tree.
        // Only a descendant that leads its own group grants ownership of that group.
        if (pid === group) {
          groups.add(group);
        }

        changed = true;
      }
    }
  }

  return [...groups];
};

const waitForGroupExit = async (groups: readonly number[]): Promise<string | undefined> => {
  const deadline = Date.now() + 1000;

  while (Date.now() < deadline) {
    const snapshot = spawnSync('ps', ['-A', '-o', 'pgid=,stat='], {
      encoding: 'utf8',
      timeout: Math.max(1, deadline - Date.now()),
    });

    if (snapshot.status !== 0) {
      return `Cannot confirm owned process exit: ${snapshot.stderr || snapshot.error?.message || snapshot.status}`;
    }

    const live = snapshot.stdout
      .trim()
      .split('\n')
      .some(line => {
        const [group, state] = line.trim().split(/\s+/);

        return groups.includes(Number(group)) && !state?.startsWith('Z');
      });

    if (!live) {
      return undefined;
    }

    await delay(20);
  }

  return `Owned process groups did not exit after SIGKILL: ${groups.join(', ')}`;
};

/** Terminates the owned command tree; never searches by executable name or start time. */
export const stopProcessTree = async (
  child: ChildProcess,
  graceMs: number,
  birth: { earliest: number; latest: number; exitedAt?: number },
): Promise<string | undefined> => {
  const pid = child.pid;

  if (pid === undefined) {
    return undefined;
  }

  if (process.platform === 'win32') {
    const powershell = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

    return new Promise(resolve => {
      const killer = spawn(
        powershell,
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          join(import.meta.dirname, 'stop-process-tree.ps1'),
          '-RootProcessId',
          String(pid),
          '-EarliestMilliseconds',
          String(birth.earliest),
          '-LatestMilliseconds',
          String(birth.latest),
          '-ExitedAtMilliseconds',
          String(birth.exitedAt ?? 0),
        ],
        { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
      );
      let diagnostic = '';
      killer.stderr.on('data', (chunk: Buffer) => {
        diagnostic = (diagnostic + chunk.toString()).slice(-8192);
      });
      const timer = setTimeout(() => {
        killer.kill();
        resolve(`Process-tree cleanup timed out for owned PID ${pid}; inspect descendants before retrying.`);
      }, 8000);
      killer.once('error', error => {
        clearTimeout(timer);
        resolve(`Cannot stop owned PID ${pid}: ${error.message}`);
      });
      killer.once('close', code => {
        clearTimeout(timer);
        resolve(
          code === 0
            ? undefined
            : `Process-tree cleanup exited ${code} for owned PID ${pid}: ${diagnostic.trim()}; inspect descendants before retrying.`,
        );
      });
    });
  }

  const groups = ownedGroups(pid);
  const errors: string[] = [];

  for (const group of groups) {
    const error = signalGroup(group, 'SIGTERM');

    if (error) {
      errors.push(error);
    }
  }

  // A root may exit first while a descendant ignores SIGTERM and holds stdout.
  // Do not settle early on the root's exit/close event.
  await new Promise<void>(resolve => setTimeout(resolve, graceMs));

  for (const group of groups) {
    const error = signalGroup(group, 'SIGKILL');

    if (error) {
      errors.push(error);
    }
  }

  // A root's close event and a successful kill syscall do not establish descendant exit.
  const pendingExit = await waitForGroupExit(groups);

  if (pendingExit) {
    errors.push(pendingExit);
  }

  return errors.length > 0 ? errors.join('; ') : undefined;
};
