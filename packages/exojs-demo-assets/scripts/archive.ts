/**
 * Packs the media profiles into self-contained archives for hosts that need a
 * copy step (offline SDK, CDN staging):
 *
 * - `archives/exojs-demo-assets-standard-<version>.zip`: the standard media, at
 *   the same relative paths `manifest.json` lists, taken from the generated
 *   `media/` tree (run `scripts/generate.ts --media` first).
 * - `archives/exojs-demo-assets-extended-<version>.zip`: the extended media,
 *   taken from the content source. The npm package never contains these bytes;
 *   the archive is the delivery for `createExtendedDemoAssets(baseUrl)`.
 *
 * Every file is verified against its manifest SHA-256 before it enters the
 * archive, and each archive gets a `.sha256` sidecar. On Windows the archive is
 * written with .NET `ZipFile` via `pwsh`; on POSIX with `zip -r`.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import { type DemoAssetProfile, filesFor, packageRoot, resolveCatalog, sha256Of } from './catalog.ts';

const catalog = resolveCatalog();
const version = (JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as { version: string }).version;

const archiveName = (profile: DemoAssetProfile): string => `exojs-demo-assets-${profile}-${version}`;

/** Copies exactly `filesFor(profile)` into `staging`, at their manifest paths, verifying each hash. */
const stageProfile = (profile: DemoAssetProfile, sourceRoot: string, staging: string): number => {
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  const staged: string[] = [];

  for (const file of filesFor(catalog, profile)) {
    const destination = resolve(staging, file.path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(resolve(sourceRoot, file.path), destination);

    if (sha256Of(destination) !== file.sha256) {
      throw new Error(`[demo-assets] ${file.path} does not match its manifest hash`);
    }

    staged.push(file.path);
  }

  return staged.length;
};

/** Zips `tree` into `zipPath` with the platform zip tool the release scripts use. */
const zipTree = (tree: string, zipPath: string): void => {
  rmSync(zipPath, { force: true });

  if (process.platform === 'win32') {
    execFileSync(
      'pwsh',
      [
        '-NoProfile',
        '-Command',
        `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${tree}','${zipPath}')`,
      ],
      { stdio: 'inherit' },
    );
  } else {
    execFileSync('zip', ['-r', '-q', zipPath, '.'], { cwd: tree, stdio: 'inherit' });
  }

  if (!existsSync(zipPath)) {
    throw new Error(`[demo-assets] expected ${zipPath} after compression, but it is missing`);
  }
};

const sha256File = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

const pack = (profile: DemoAssetProfile, sourceRoot: string): void => {
  const staging = resolve(packageRoot, '.archive-staging', profile);
  const fileCount = stageProfile(profile, sourceRoot, staging);

  const archives = resolve(packageRoot, 'archives');
  mkdirSync(archives, { recursive: true });
  const zipPath = resolve(archives, `${archiveName(profile)}.zip`);
  zipTree(staging, zipPath);
  writeFileSync(`${zipPath}.sha256`, `${sha256File(zipPath)}  ${basename(zipPath)}\n`, 'utf8');

  process.stdout.write(`[demo-assets] ${archiveName(profile)}.zip: ${fileCount} files\n`);
};

const main = (): void => {
  // Standard bytes come from the generated media/ tree so the archive and the
  // npm tarball are one delivery; extended bytes come straight from the
  // content source and are never in the npm package.
  const mediaRoot = resolve(packageRoot, 'media');

  if (!existsSync(mediaRoot)) {
    throw new Error('[demo-assets] media/ is missing; run `pnpm --filter @codexo/exojs-demo-assets generate -- --media` first');
  }

  pack('standard', mediaRoot);
  pack('extended', catalog.sourceRoot);
  rmSync(resolve(packageRoot, '.archive-staging'), { recursive: true, force: true });
};

main();
