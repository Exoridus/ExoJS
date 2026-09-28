import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const mode = process.argv[2];
const pidFile = process.argv[3];

if (mode === 'streams') {
  process.stdout.write(`stdout:${process.env['EXOJS_OUTPUT']}\n`);
  process.stderr.write('stderr\n');
} else if (mode === 'failure') {
  for (let i = 0;i < 125;i++) process.stdout.write(`line-${i}\n`);
  process.stdout.write('last-line');
  process.exitCode = 7;
} else if (mode === 'long-line') {
  process.stdout.write('x'.repeat(200_000));
  process.exitCode = 7;
} else if (mode === 'sleep' || mode === 'stubborn') {
  if (mode === 'stubborn') process.on('SIGTERM', () => undefined);
  if (pidFile) writeFileSync(pidFile, String(process.pid));
  process.stdout.write('ready\n');
  // Bounded even when testing the old supervisor, which has no timeout.
  setTimeout(() => process.exit(0), process.platform === 'win32' ? 15_000 : 1800);
} else if (mode === 'tree' || mode === 'orphan' || mode === 'detached-tree') {
  const child = spawn(process.execPath, [...process.execArgv, import.meta.filename, 'stubborn', pidFile!], {
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: mode === 'detached-tree',
  });
  process.stdout.write(`child=${child.pid}\n`);
  if (mode === 'orphan') {
    // Exiting while the create request is still in flight leaves no descendant at all on Windows,
    // which would make the ownership check pass without ever exercising a surviving orphan.
    child.once('spawn', () => process.exit(0));
    child.once('error', () => process.exit(1));
  } else setTimeout(() => process.exit(0), process.platform === 'win32' ? 15_100 : 1900);
} else {
  throw new Error(`Unknown validation fixture: ${mode}`);
}
