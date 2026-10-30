import { acquireValidationLock } from '../../../scripts/lib/validation-lock.ts';

const lock = acquireValidationLock(process.argv[2]!);
process.on('message', message => {
  if (message === 'release') {
    lock.release();
    process.disconnect?.();
  }
});
process.send?.({ path: lock.path });
