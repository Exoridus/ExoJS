import { readFileSync } from 'node:fs';

/**
 * The version of this tool, read from its own manifest.
 *
 * Resolved relative to the module rather than to the working directory, and the
 * emit is flat for that reason: `dist/cliVersion.js` and `src/cliVersion.ts` sit
 * the same distance from the manifest, so the path cannot be right in one and
 * wrong in the other.
 */
export const readCliVersion = (): string => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

  return manifest.version;
};
