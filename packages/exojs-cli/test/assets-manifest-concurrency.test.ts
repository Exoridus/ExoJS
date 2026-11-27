import { type ChildProcess, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { runAssetsPack } from '../src/commands/assetsPack';

interface WorkerResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface PackWorker {
  readonly child: ChildProcess;
  readonly controlDirectory: string;
  readonly completion: Promise<WorkerResult>;
  readonly result: WorkerResult | undefined;
}

interface ManifestPack {
  readonly file: string;
  readonly hash: string;
  readonly byteLength: number;
  readonly entries: readonly string[];
}

const fixture = fileURLToPath(new URL('./fixtures/assets-manifest-worker.ts', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const workers: PackWorker[] = [];
let workDirectory: string;
let manifestPath: string;

const description = (name: string): string => {
  const path = join(workDirectory, `${name}.json`);

  writeFileSync(join(workDirectory, `${name}.txt`), `The payload for ${name}.`);
  writeFileSync(path, JSON.stringify({ output: `${name}.exoa`, assets: [{ source: `${name}.txt`, type: 'text', file: `${name}.txt` }] }));

  return path;
};

const startWorker = (
  name: string,
  mode: 'after-read' | 'read-or-contention' | 'before-lock-rename' | 'before-manifest-rename' | 'reap-then-contention' | 'none',
): PackWorker => {
  const controlDirectory = join(workDirectory, `${name}-control`);

  mkdirSync(controlDirectory);

  const child = spawn(
    process.execPath,
    ['--import', import.meta.resolve('tsx'), fixture, description(name), manifestPath, controlDirectory, mode],
    {
      cwd: repository,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stdout = '';
  let stderr = '';
  let result: WorkerResult | undefined;
  const completion = new Promise<WorkerResult>(resolve => {
    child.stdout!.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr!.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once('error', error => {
      result = { code: null, signal: null, stdout, stderr: `${stderr}\n${error.message}` };
      resolve(result);
    });
    child.once('close', (code, signal) => {
      result = { code, signal, stdout, stderr };
      resolve(result);
    });
  });
  const worker: PackWorker = {
    child,
    controlDirectory,
    completion,
    get result() {
      return result;
    },
  };

  workers.push(worker);

  return worker;
};

const waitForPause = async (worker: PackWorker, points: readonly string[]): Promise<string> => {
  const deadline = performance.now() + 10_000;

  for (;;) {
    const point = points.find(name => existsSync(join(worker.controlDirectory, `${name}.ready`)));

    if (point !== undefined) {
      return point;
    }

    if (worker.result !== undefined) {
      throw new Error(`The manifest worker exited before ${points.join(' or ')}: ${JSON.stringify(worker.result)}`);
    }

    if (performance.now() >= deadline) {
      throw new Error(`The manifest worker did not reach ${points.join(' or ')}.`);
    }

    await delay(10);
  }
};

const release = (worker: PackWorker, point: string): void => {
  writeFileSync(join(worker.controlDirectory, `${point}.release`), 'release');
};

const expectPacks = (names: readonly string[]): void => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { packs: Record<string, ManifestPack> };

  expect(Object.keys(manifest.packs)).toEqual(names);

  for (const name of names) {
    const pack = manifest.packs[name]!;
    const bytes = readFileSync(join(workDirectory, pack.file));

    expect(pack.entries).toEqual([`${name}.txt`]);
    expect(pack.byteLength).toBe(bytes.byteLength);
    expect(pack.hash).toBe(createHash('sha256').update(bytes).digest('hex'));
  }
};

beforeEach(() => {
  workDirectory = mkdtempSync(join(tmpdir(), 'exo-manifest-concurrency-'));
  manifestPath = join(workDirectory, 'assets.json');
  expect(runAssetsPack([description('seed'), '--manifest', manifestPath])).toBe(0);
});

afterEach(async () => {
  for (const worker of workers) {
    if (worker.result === undefined) {
      worker.child.kill('SIGKILL');
    }
  }

  await Promise.all(workers.map(worker => worker.completion));
  workers.length = 0;
  rmSync(workDirectory, { recursive: true, force: true });
});

describe('exo assets pack manifest process coordination', () => {
  test('preserves both successful writers when their manifest updates overlap', async () => {
    const first = startWorker('alpha', 'after-read');

    await waitForPause(first, ['manifest-read']);

    const second = startWorker('bravo', 'read-or-contention');
    const secondPause = await waitForPause(second, ['manifest-read', 'lock-contention']);

    // An unprotected writer reaches its stale read; a protected one reaches
    // contention. Both schedules are forced before the first writer commits.
    release(first, 'manifest-read');
    expect(await first.completion).toMatchObject({ code: 0, signal: null });
    release(second, secondPause);
    expect(await second.completion).toMatchObject({ code: 0, signal: null });

    expectPacks(['alpha', 'bravo', 'seed']);
  });

  test('recovers after a lock owner is killed before publishing its update', async () => {
    const before = readFileSync(manifestPath, 'utf8');
    const abandoned = startWorker('alpha', 'after-read');

    await waitForPause(abandoned, ['manifest-read']);
    expect(existsSync(`${manifestPath}.lock`)).toBe(true);
    abandoned.child.kill('SIGKILL');
    expect(await abandoned.completion).toMatchObject({ signal: 'SIGKILL' });
    expect(readFileSync(manifestPath, 'utf8')).toBe(before);

    const successor = startWorker('bravo', 'none');

    expect(await successor.completion).toMatchObject({ code: 0, signal: null });
    expectPacks(['bravo', 'seed']);
    expect(existsSync(`${manifestPath}.lock`)).toBe(false);
  });

  test('ignores a prepared lock candidate when its writer dies before acquiring the manifest', async () => {
    const abandoned = startWorker('alpha', 'before-lock-rename');

    await waitForPause(abandoned, ['lock-pending']);

    const candidatePath = readFileSync(join(abandoned.controlDirectory, 'lock-pending.ready'), 'utf8');
    const candidateMarkers = readdirSync(candidatePath);
    const candidateRecords = candidateMarkers.map(name => readFileSync(join(candidatePath, name), 'utf8'));

    expect(candidateMarkers).toHaveLength(1);
    expect(JSON.parse(candidateRecords[0]!)).toMatchObject({ pid: abandoned.child.pid });
    expect(existsSync(`${manifestPath}.lock`)).toBe(false);
    abandoned.child.kill('SIGKILL');
    expect(await abandoned.completion).toMatchObject({ signal: 'SIGKILL' });

    const successor = startWorker('bravo', 'none');

    expect(await successor.completion).toMatchObject({ code: 0, signal: null });
    expectPacks(['bravo', 'seed']);
    expect(readdirSync(candidatePath)).toEqual(candidateMarkers);
    expect(candidateMarkers.map(name => readFileSync(join(candidatePath, name), 'utf8'))).toEqual(candidateRecords);
    expect(existsSync(`${manifestPath}.lock`)).toBe(false);
  });

  test('keeps the previous manifest and ignores staging abandoned before the commit rename', async () => {
    const before = readFileSync(manifestPath, 'utf8');
    const abandoned = startWorker('alpha', 'before-manifest-rename');

    await waitForPause(abandoned, ['manifest-pending']);

    const pendingPath = readFileSync(join(abandoned.controlDirectory, 'manifest-pending.ready'), 'utf8');
    const pending = readFileSync(pendingPath, 'utf8');

    expect(Object.keys((JSON.parse(pending) as { packs: object }).packs)).toEqual(['alpha', 'seed']);
    expect(readFileSync(manifestPath, 'utf8')).toBe(before);
    abandoned.child.kill('SIGKILL');
    expect(await abandoned.completion).toMatchObject({ signal: 'SIGKILL' });
    expect(readFileSync(manifestPath, 'utf8')).toBe(before);

    const successor = startWorker('bravo', 'none');

    expect(await successor.completion).toMatchObject({ code: 0, signal: null });
    expectPacks(['bravo', 'seed']);
    expect(readFileSync(pendingPath, 'utf8')).toBe(pending);
    expect(existsSync(`${manifestPath}.lock`)).toBe(false);
  });

  test('a delayed stale reaper cannot remove a successor that another reaper already acquired', async () => {
    const abandoned = startWorker('alpha', 'after-read');

    await waitForPause(abandoned, ['manifest-read']);
    abandoned.child.kill('SIGKILL');
    expect(await abandoned.completion).toMatchObject({ signal: 'SIGKILL' });

    const delayed = startWorker('bravo', 'reap-then-contention');

    await waitForPause(delayed, ['stale-owner']);

    const successor = startWorker('charlie', 'after-read');

    await waitForPause(successor, ['manifest-read']);

    const lockPath = `${manifestPath}.lock`;
    const successorMarkers = readdirSync(lockPath);
    const successorRecords = successorMarkers.map(name => readFileSync(join(lockPath, name), 'utf8'));

    release(delayed, 'stale-owner');
    await waitForPause(delayed, ['lock-contention']);
    expect(readdirSync(lockPath)).toEqual(successorMarkers);
    expect(successorMarkers.map(name => readFileSync(join(lockPath, name), 'utf8'))).toEqual(successorRecords);

    release(successor, 'manifest-read');
    expect(await successor.completion).toMatchObject({ code: 0, signal: null });
    release(delayed, 'lock-contention');
    expect(await delayed.completion).toMatchObject({ code: 0, signal: null });

    expectPacks(['bravo', 'charlie', 'seed']);
    expect(existsSync(lockPath)).toBe(false);
  });
});
