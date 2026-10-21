#!/usr/bin/env node
// Copies the package's standard media into a directory a host serves, so the
// descriptors from `createDemoAssets(new URL(<that directory>))` resolve.
//
//   exojs-demo-assets-copy <target-directory> [--clean]
//
// The copy is deterministic: exactly the files `manifest.json` lists for the
// standard profile, at their manifest paths, each verified against its SHA-256.
// `--clean` removes the target first so no file from an older version survives.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const target = args.find(arg => !arg.startsWith('--'));

if (target === undefined) {
  process.stderr.write('usage: exojs-demo-assets-copy <target-directory> [--clean]\n');
  process.exit(2);
}

/** @type {{ files: Array<{ path: string; sha256: string; profile: string }> }} */
const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'manifest.json'), 'utf8'));
const destinationRoot = resolve(target);

if (args.includes('--clean')) {
  rmSync(destinationRoot, { recursive: true, force: true });
}

let copied = 0;

for (const file of manifest.files) {
  if (file.profile !== 'standard') {
    continue;
  }

  const destination = resolve(destinationRoot, file.path);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(resolve(packageRoot, 'media', file.path), destination);

  if (createHash('sha256').update(readFileSync(destination)).digest('hex') !== file.sha256) {
    process.stderr.write(`exojs-demo-assets-copy: ${file.path} does not match its manifest hash\n`);
    process.exit(1);
  }

  copied += 1;
}

process.stdout.write(`exojs-demo-assets-copy: ${copied} files -> ${destinationRoot}\n`);
