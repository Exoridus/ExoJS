import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

process.on('message', message => {
  if (message === 'SIGINT' || message === 'SIGTERM') {
    process.emit(message);
  }
});
const entry = resolve(import.meta.dirname, '../../../scripts/lanes.ts');
process.argv = [process.execPath, entry, '--run', '--only=webgpu', '--output=silent'];
await import(pathToFileURL(entry).href);
process.disconnect?.();
