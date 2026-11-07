import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { sha256 } from './files.ts';

export interface ToolchainPin {
  repository: string;
  commit: string;
  version: string;
  license: string;
  schema: { path: string; sha256: string; source: string };
}

export const REPO_ROOT = resolve(import.meta.dirname, '../..');
export const SOURCE_DIRECTORY = join(REPO_ROOT, 'tools/pixel-vfx');
export const DEFAULT_TOOL_DIRECTORY = join(REPO_ROOT, '.workspace/tools/pixelbolt');
export const DEFAULT_SCRATCH_DIRECTORY = join(REPO_ROOT, '.workspace/pixel-vfx');

export const readToolchainPin = (): ToolchainPin =>
  JSON.parse(readFileSync(join(SOURCE_DIRECTORY, 'toolchain.json'), 'utf8')) as ToolchainPin;

export const readPinnedSchema = (): object => {
  const pin = readToolchainPin();
  const bytes = readFileSync(join(SOURCE_DIRECTORY, 'pixelbolt.schema.json'));

  if (sha256(bytes) !== pin.schema.sha256) {
    throw new Error('Vendored Pixelbolt schema differs from the pinned upstream schema');
  }

  return JSON.parse(bytes.toString('utf8')) as object;
};

export const verifyToolchain = (directory: string): ToolchainPin => {
  const pin = readToolchainPin();
  const git = (...args: string[]): string => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
  let revision: string;

  try {
    revision = git('rev-parse', 'HEAD');
  } catch {
    throw new Error('Pixelbolt checkout is unavailable. Run the pixel-vfx setup command first.');
  }

  if (revision !== pin.commit) {
    throw new Error(`Pixelbolt revision ${revision} differs from pinned ${pin.commit}; use a separate checkout of the pin`);
  }

  if (git('status', '--porcelain', '--untracked-files=no')) {
    throw new Error('Pixelbolt has tracked modifications; generation requires a clean pinned checkout');
  }

  const packageJson = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
    license: string;
  };

  if (packageJson.name !== 'pixelbolt' || packageJson.version !== pin.version || packageJson.license !== pin.license) {
    throw new Error('Pixelbolt package version or license differs from the toolchain pin');
  }

  if (sha256(readFileSync(join(directory, pin.schema.path))) !== pin.schema.sha256) {
    throw new Error('Pixelbolt checkout schema differs from the pinned schema');
  }

  readPinnedSchema();

  return pin;
};
