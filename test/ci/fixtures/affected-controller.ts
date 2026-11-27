import { runAffectedProcess } from '../../../scripts/ci/affected-process.ts';

const [entry, ...args] = process.argv.slice(2);

if (!entry) {
  throw new Error('Expected an affected-test entry point.');
}

// Exercise the real controller without Windows' unconditional kill semantics.
// The controller still sends its production IPC message to the Vitest child.
process.on('message', message => {
  if (message === 'SIGINT' || message === 'SIGTERM') {
    process.emit(message);
  }
});

process.exitCode = await runAffectedProcess(entry, args);
process.disconnect?.();
