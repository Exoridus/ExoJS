import { resolve } from 'node:path';

import { runCommand } from '../../../scripts/lib/run-command.ts';

process.on('message', message => {
  if (message === 'SIGINT') {
    process.emit('SIGINT');
  } else if (message === 'SIGTERM') {
    process.emit('SIGTERM');
  }
});
const result = await runCommand({
  label: 'external-supervisor',
  command: process.execPath,
  args: [
    ...process.execArgv,
    resolve(import.meta.dirname, 'validation-process.ts'),
    process.argv[2]!,
    ...(process.argv[3] ? [process.argv[3]] : []),
  ],
  cwd: process.cwd(),
  output: 'silent',
  killGraceMs: 80,
  timeoutMs: 20_000,
});
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.status;
process.disconnect?.();
