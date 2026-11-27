import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, join } from 'node:path';

const [descriptionPath, manifestPath, controlDirectory, mode] = process.argv.slice(2);

if (descriptionPath === undefined || manifestPath === undefined || controlDirectory === undefined || mode === undefined) {
  throw new Error('The manifest worker needs a description, manifest, control directory and scheduling mode.');
}

const nativeRead = fs.readFileSync;
const nativeWrite = fs.writeFileSync;
const nativeExists = fs.existsSync;
const nativeRename = fs.renameSync;
const nativeUnlink = fs.unlinkSync;
const sleeper = new Int32Array(new SharedArrayBuffer(4));
let paused = false;
let reaperReleased = false;
let contentionPaused = false;

const pause = (point: string, detail = 'ready'): void => {
  paused = true;
  nativeWrite(join(controlDirectory, `${point}.ready`), detail);

  const deadline = performance.now() + 20_000;

  while (!nativeExists(join(controlDirectory, `${point}.release`))) {
    if (performance.now() >= deadline) {
      throw new Error(`The manifest worker timed out at ${point}.`);
    }

    Atomics.wait(sleeper, 0, 0, 10);
  }
};

// The real filesystem calls still run. Only their scheduling is controlled;
// separate processes must retain their own manifest snapshots until released.
fs.readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
  const result = nativeRead(...args);

  if (!paused && args[0] === manifestPath && (mode === 'after-read' || mode === 'read-or-contention')) {
    pause('manifest-read');
  }

  return result;
}) as typeof fs.readFileSync;

fs.renameSync = ((...args: Parameters<typeof fs.renameSync>) => {
  if (!paused && mode === 'before-lock-rename' && args[1] === `${manifestPath}.lock`) {
    pause('lock-pending', String(args[0]));
  }

  if (!paused && mode === 'before-manifest-rename' && args[1] === manifestPath) {
    pause('manifest-pending', String(args[0]));
  }

  try {
    nativeRename(...args);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (
      ((!paused && mode === 'read-or-contention') || (mode === 'reap-then-contention' && reaperReleased && !contentionPaused)) &&
      args[1] === `${manifestPath}.lock` &&
      (code === 'EEXIST' || code === 'ENOTEMPTY' || code === 'EPERM' || code === 'EACCES')
    ) {
      contentionPaused = true;
      pause('lock-contention');
    }

    throw error;
  }
}) as typeof fs.renameSync;

fs.unlinkSync = ((...args: Parameters<typeof fs.unlinkSync>) => {
  if (
    mode === 'reap-then-contention' &&
    !reaperReleased &&
    typeof args[0] === 'string' &&
    dirname(args[0]) === `${manifestPath}.lock` &&
    args[0].endsWith('.json')
  ) {
    pause('stale-owner', args[0]);
    reaperReleased = true;
  }

  nativeUnlink(...args);
}) as typeof fs.unlinkSync;

syncBuiltinESMExports();

const { runAssetsPack } = await import('../../src/commands/assetsPack.ts');

process.exitCode = runAssetsPack([descriptionPath, '--manifest', manifestPath]);
