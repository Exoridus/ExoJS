import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { DEFAULT_TOOL_DIRECTORY, readToolchainPin, verifyToolchain } from './toolchain.ts';

const main = (): void => {
  const { values } = parseArgs({ options: { 'tool-dir': { type: 'string' } } });
  const directory = resolve(values['tool-dir'] ?? DEFAULT_TOOL_DIRECTORY);
  const pin = readToolchainPin();

  if (!existsSync(directory)) {
    mkdirSync(dirname(directory), { recursive: true });
    execFileSync('git', ['init', '--quiet', directory], { stdio: 'inherit' });
    execFileSync('git', ['-C', directory, 'remote', 'add', 'origin', pin.repository], { stdio: 'inherit' });
    execFileSync('git', ['-C', directory, 'fetch', '--depth=1', 'origin', pin.commit], { stdio: 'inherit' });
    execFileSync('git', ['-C', directory, 'checkout', '--quiet', '--detach', pin.commit], { stdio: 'inherit' });
  }

  verifyToolchain(directory);
  console.log(`Pixelbolt ${pin.version} ready at ${directory} (${pin.commit}). No npm install is required for Pixelbolt.`);
};

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
