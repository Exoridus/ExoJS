/**
 * Derives the `capabilities` array for each entry in
 * `examples/examples.json` by scanning the corresponding example source
 * for hard runtime requirements: imported subpaths, audio API surface,
 * input modalities, etc.
 *
 * Idempotent: runs against the current sources and overwrites the
 * `capabilities` field on each catalog entry. Re-run whenever examples
 * change. The default render backend (`webgl2`) is implicit for every
 * example and never declared.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharedPrettierConfig from '@codexo/exojs-config/prettier';
import { format as formatSource } from 'prettier';

import { type Capability, deriveCapabilities } from './lib/example-capabilities';

interface CatalogEntry {
  slug: string;
  path: string;
  title: string;
  description: string;
  backend: string;
  capabilities?: Capability[];
  tags?: string[];
}

type Catalog = Record<string, CatalogEntry[]>;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const examplesDir = join(repoRoot, 'examples');
const manifestPath = join(examplesDir, 'examples.json');

const syncCapabilities = async (): Promise<void> => {
  const raw = readFileSync(manifestPath, 'utf8');
  const catalog = JSON.parse(raw) as Catalog;

  let changed = 0;
  let unchanged = 0;

  for (const [section, entries] of Object.entries(catalog)) {
    for (const entry of entries) {
      const sourcePath = join(examplesDir, entry.path);
      const source = readFileSync(sourcePath, 'utf8');
      const derived = deriveCapabilities(source, entry.slug, section);

      const before = JSON.stringify(entry.capabilities ?? []);
      const after = JSON.stringify(derived);

      if (before !== after) {
        if (derived.length === 0) {
          delete entry.capabilities;
        } else {
          entry.capabilities = derived;
        }

        changed++;
      } else {
        unchanged++;
      }
    }
  }

  // Formatted rather than written straight out of `JSON.stringify`: the manifest
  // is hand-edited as well as machine-updated, and the two only converge if both
  // produce the same shape. `stringify` expands every array, Prettier collapses
  // the short ones, so without this the file alternates on every run.
  writeFileSync(manifestPath, await formatSource(JSON.stringify(catalog), { ...sharedPrettierConfig, parser: 'json' }));

  process.stdout.write(`Sync complete. Changed: ${changed}, unchanged: ${unchanged}.\n`);
};

void syncCapabilities();
