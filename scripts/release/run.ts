#!/usr/bin/env tsx
/**
 * Coordinated-release driver — the local/CI entrypoint for the two-stage,
 * build-once release pipeline.
 *
 *   tsx scripts/release/run.ts prepare   [--build] [--skip-attw] [--skip-consumers] [--skip-zip]
 *   tsx scripts/release/run.ts full-zip
 *   tsx scripts/release/run.ts publish   [--execute] [--no-check-existing]
 *
 * `prepare` builds (optionally), freezes the exact source revision (failing on
 * a dirty tree or unknown revision), packs one tarball per lockstep package WITHOUT
 * rebuilding them, hashes them into `release-manifest.json` + `checksums.sha256`,
 * runs attw and the external-consumer smoke against those exact tarballs, and
 * assembles the Full GitHub Release ZIP. `publish` consumes only the prepared
 * artifacts — it re-hashes them (build-once guard) and never builds. The real
 * publish is gated behind `--execute`; the default is a dry-run.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveRevision } from '../../packages/exojs-config/build-defines/index.js';
import { checkAllTarballTypes } from './attw.ts';
import { createExecRunner } from './command-runner.ts';
import { verifyExternalConsumers } from './external-consumers.ts';
import { LOCKSTEP_PACKAGES } from './lockstep-packages.ts';
import { assembleFullReleaseTree, compressTree, treeBytes } from './full-zip.ts';
import { type ReleaseManifest, serializeManifest, renderChecksums } from './manifest.ts';
import { prepareRelease } from './prepare.ts';
import { defaultPublishOptions, publishRelease } from './publish.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const releaseDir = resolve(repoRoot, '.release');
const stagingDir = resolve(releaseDir, 'artifacts');
const siteDistDir = resolve(repoRoot, 'site', 'dist');
const manifestPath = resolve(stagingDir, 'release-manifest.json');

const runner = createExecRunner({ echo: true });
const argv = process.argv.slice(2);
const has = (flag: string): boolean => argv.includes(flag);

const log = (message: string): void => process.stdout.write(`${message}\n`);
const die = (message: string): never => {
  process.stderr.write(`\n✗ ${message}\n`);
  process.exit(1);
};

const ensureBuilt = (): void => {
  const dists = LOCKSTEP_PACKAGES.map(p => resolve(repoRoot, p.dir === '.' ? 'dist/esm' : `${p.dir}/dist/esm`));
  const missing = dists.filter(d => !existsSync(d));
  if (missing.length > 0) {
    die(`Not built — missing ${missing.join(', ')}. Run "pnpm build" + extension builds, or pass --build.`);
  }
};

const build = (): void => {
  log('\n→ Building core + extensions (build-once)…');
  // Core is `pnpm build`; each extension is `pnpm --filter <name> build`. pnpm
  // resolves workspace-dependency order itself (e.g. tilemap before tiled/ldtk).
  for (const pkg of LOCKSTEP_PACKAGES) {
    const args = pkg.isExtension ? ['--filter', pkg.name, 'build'] : ['build'];
    const r = runner.run({ command: 'pnpm', args, cwd: repoRoot });
    if (r.code !== 0) die(`build failed for ${pkg.name}:\n${r.stderr || r.stdout}`);
  }
};

const writeManifest = (manifest: ReleaseManifest): void => {
  writeFileSync(manifestPath, serializeManifest(manifest), 'utf8');
  writeFileSync(resolve(stagingDir, 'checksums.sha256'), renderChecksums(manifest), 'utf8');
};

/** Resolve and freeze the revision. Fails on dirty tree or unknown revision. */
const freezeRevision = (): string => {
  log('\n→ Freezing revision…');

  const dirtyResult = runner.run({ command: 'git', args: ['diff-index', '--quiet', 'HEAD', '--'] });
  if (dirtyResult.code !== 0) {
    die('Working tree is dirty — a release must be prepared from a clean tree. Commit or stash changes first.');
  }

  const explicit = process.env['EXOJS_REVISION'];
  if (explicit) {
    log(`  using explicit EXOJS_REVISION=${explicit}`);
    return explicit;
  }

  const revision = resolveRevision({ cwd: repoRoot });
  if (revision === 'unknown') {
    die('Cannot determine source revision. Set EXOJS_REVISION or ensure Git metadata is available.');
  }

  log(`  revision: ${revision} (short: ${revision.slice(0, 7)})`);
  return revision;
};

const doPrepare = (): void => {
  mkdirSync(releaseDir, { recursive: true });

  if (has('--build')) build();
  else ensureBuilt();

  const revision = freezeRevision();

  log('\n→ Packing lockstep tarballs (no rebuild) + manifest + checksums…');
  const prepared = prepareRelease(runner, { rootDir: repoRoot, stagingDir, revision });
  let manifest = prepared.manifest;
  log(`  packed: ${manifest.packages.map(p => `${p.name}@${p.version} (${p.bytes}B)`).join(', ')}`);
  log(`  revision: ${manifest.shortRevision} (${manifest.revision})`);

  if (!has('--skip-attw')) {
    log('\n→ attw (are-the-types-wrong) on each tarball…');
    const attw = checkAllTarballTypes(runner, prepared.tarballs);
    for (const r of attw.results) log(`  ${r.ok ? '✓' : '✗'} ${r.tarball.split(/[\\/]/).pop()}${r.detail ? ` — ${r.detail}` : ''}`);
    if (!attw.ok) die('attw bundler check failed.');
  }

  if (!has('--skip-consumers')) {
    log('\n→ External consumers (Node ESM + TypeScript bundler resolution, offline, outside repo)…');
    // Offline-smoke subset only: `@codexo/exojs-react` is excluded because its
    // `react`/`react-dom` peers cannot be resolved in an offline throwaway
    // project. attw still type-checks every packed tarball (react included).
    const smokeNames = new Set(LOCKSTEP_PACKAGES.filter(p => p.inOfflineSmoke).map(p => p.name));
    const smokeTarballs = manifest.packages.filter(p => smokeNames.has(p.name)).map(p => resolve(stagingDir, p.file));
    const consumers = verifyExternalConsumers(smokeTarballs);
    for (const c of consumers.checks) log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
    if (!consumers.ok) die('external consumer smoke failed.');
  }

  if (!has('--skip-zip')) {
    log('\n→ Assembling Full GitHub Release ZIP…');
    if (!existsSync(siteDistDir)) die(`Missing ${siteDistDir}. Run "pnpm site:build" first.`);
    const tree = assembleFullReleaseTree({
      version: manifest.version,
      rootDir: repoRoot,
      stagingDir,
      siteDistDir,
      outDir: releaseDir,
      manifest,
    });
    if (tree.forbidden.length > 0) {
      for (const hit of tree.forbidden) log(`  ✗ forbidden: ${hit.file} (${hit.pattern})`);
      die(`Full ZIP contains forbidden content (${tree.forbidden.length} hit(s)).`);
    }
    log(`  tree: ${tree.treeName} (${(treeBytes(tree.treeDir) / 1_048_576).toFixed(1)} MiB)`);
    const zip = compressTree(runner, { treeDir: tree.treeDir, treeName: tree.treeName, outDir: releaseDir });
    manifest = { ...manifest, fullZip: { file: `${tree.treeName}.zip`, sha256: zip.sha256, bytes: zip.bytes } };
    log(`  zip:  ${tree.treeName}.zip (${(zip.bytes / 1_048_576).toFixed(1)} MiB) sha256 ${zip.sha256.slice(0, 16)}…`);
  }

  writeManifest(manifest);
  log(`\n✓ prepare complete — artifacts in ${stagingDir} + ${releaseDir}`);
  log(`  manifest: ${manifestPath}`);
};

const doFullZip = (): void => {
  if (!existsSync(manifestPath)) die('No manifest — run "release:prepare" first.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ReleaseManifest;
  if (!existsSync(siteDistDir)) die(`Missing ${siteDistDir}. Run "pnpm site:build" first.`);
  const tree = assembleFullReleaseTree({
    version: manifest.version,
    rootDir: repoRoot,
    stagingDir,
    siteDistDir,
    outDir: releaseDir,
    manifest,
  });
  if (tree.forbidden.length > 0) {
    for (const hit of tree.forbidden) log(`  ✗ forbidden: ${hit.file} (${hit.pattern})`);
    die(`Full ZIP contains forbidden content (${tree.forbidden.length} hit(s)).`);
  }
  const zip = compressTree(runner, { treeDir: tree.treeDir, treeName: tree.treeName, outDir: releaseDir });
  writeManifest({ ...manifest, fullZip: { file: `${tree.treeName}.zip`, sha256: zip.sha256, bytes: zip.bytes } });
  log(`✓ ${tree.treeName}.zip (${(zip.bytes / 1_048_576).toFixed(1)} MiB)`);
};

const doPublish = (): void => {
  if (!existsSync(manifestPath)) die('No manifest — run "release:prepare" first.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ReleaseManifest;

  const options = {
    ...defaultPublishOptions(manifest.version),
    dryRun: !has('--execute'),
    checkExisting: !has('--no-check-existing'),
    provenance: has('--execute'),
  };

  log(`\n→ Publish (${options.dryRun ? 'DRY-RUN' : 'EXECUTE'}) — dist-tag ${options.distTag}`);
  log(`  revision: ${manifest.shortRevision}`);
  const report = publishRelease(manifest, options, runner, file => resolve(stagingDir, file));

  if (report.abortReason) die(`publish aborted: ${report.abortReason}`);
  for (const p of report.packages) {
    log(`  ${p.name}@${p.version}: publish=${p.publish}${p.detail ? ` — ${p.detail}` : ''}`);
  }
  if (!report.ok) die('publish reported failure.');
  log(`\n✓ publish ${options.dryRun ? 'dry-run' : 'run'} complete (ok).`);
};

const command = argv[0];
switch (command) {
  case 'prepare':
    doPrepare();
    break;
  case 'full-zip':
    doFullZip();
    break;
  case 'publish':
    doPublish();
    break;
  default:
    die(`Unknown command "${command ?? ''}". Use: prepare | full-zip | publish.`);
}
