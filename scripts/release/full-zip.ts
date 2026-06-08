/**
 * Full GitHub Release archive assembly: `exojs-v<version>-full.zip`.
 *
 * A self-contained, offline-servable snapshot of a coordinated release:
 *
 *   npm/      the three official tarballs (Core, Particles, Tiled)
 *   vendor/   each package's ESM tree (exojs, exojs-particles, exojs-tiled)
 *   examples/ src/** (TS), js/** (transpiled), assets/**, examples.json
 *   site/     the built static site (itself servable; references ./vendor + ./examples)
 *   README.md CHANGELOG.md LICENSE release-manifest.json checksums.sha256
 *
 * `assembleFullReleaseTree` is the testable core (pure fs assembly + a
 * forbidden-content scan); `compressTree` shells out to the platform zip tool.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

import type { CommandRunner } from './command-runner.ts';
import { type ReleaseManifest, renderChecksums, serializeManifest, sha256File } from './manifest.ts';

export interface AssembleOptions {
  version: string;
  rootDir: string;
  /** Directory holding the packed tarballs + manifest from `prepare`. */
  stagingDir: string;
  /** Built static site (`site/dist`). */
  siteDistDir: string;
  /** Directory the `exojs-v<ver>-full/` tree + zip are written into. */
  outDir: string;
  manifest: ReleaseManifest;
}

const VENDOR_PACKAGES = [
  { name: 'exojs', vendorDir: 'exojs' },
  { name: 'exojs-particles', vendorDir: 'exojs-particles' },
  { name: 'exojs-tiled', vendorDir: 'exojs-tiled' },
] as const;

const FORBIDDEN_PATTERNS: Array<{ label: string; test: (text: string) => boolean }> = [
  { label: 'workspace: specifier', test: t => t.includes('workspace:') },
  { label: '@assets alias', test: t => /['"`]@assets['"`/]/.test(t) },
  { label: '@/ alias import', test: t => /(from|import)\s*\(?\s*['"`]@\//.test(t) },
  { label: '@codexo/exojs-assets reference', test: t => t.includes('@codexo/exojs-assets') },
];

const walk = (dir: string): string[] => {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
};

const copyFile = (from: string, toDir: string): void => {
  mkdirSync(toDir, { recursive: true });
  cpSync(from, join(toDir, basename(from)));
};

export interface ForbiddenHit {
  file: string;
  pattern: string;
}

/**
 * Scans the shipped runtime artifacts (vendor ESM, examples, npm tarball
 * manifests) for forbidden patterns and raw `.ts` runtime entrypoints. The
 * built `site/` bundle is intentionally excluded — minified third-party bundles
 * may contain arbitrary substrings; the contract is about the package
 * artifacts. `examples/src/**` is the only place `.ts` is allowed (example
 * lesson sources, not runtime entrypoints).
 */
export const scanForbiddenContent = (treeDir: string): ForbiddenHit[] => {
  const hits: ForbiddenHit[] = [];
  const scanRoots = [join(treeDir, 'vendor'), join(treeDir, 'examples')];

  for (const root of scanRoots) {
    for (const file of walk(root)) {
      const rel = relative(treeDir, file).split('\\').join('/');

      // No raw .ts runtime entrypoints in vendor/ (only .js/.d.ts/.map).
      if (rel.startsWith('vendor/') && file.endsWith('.ts') && !file.endsWith('.d.ts')) {
        hits.push({ file: rel, pattern: 'raw .ts runtime entrypoint' });
        continue;
      }

      if (!/\.(js|mjs|cjs|ts|json|map)$/.test(file)) continue;
      const text = readFileSync(file, 'utf8');
      for (const { label, test } of FORBIDDEN_PATTERNS) {
        if (test(text)) hits.push({ file: rel, pattern: label });
      }
    }
  }

  return hits;
};

const assembleExamples = (rootDir: string, examplesOut: string): void => {
  const examplesSrc = resolve(rootDir, 'examples');
  const srcOut = join(examplesOut, 'src');
  const jsOut = join(examplesOut, 'js');

  for (const file of walk(examplesSrc)) {
    const rel = relative(examplesSrc, file).split('\\').join('/');
    // assets/ and shared/ are copied wholesale below; skip here.
    if (rel.startsWith('assets/') || rel.startsWith('shared/')) continue;

    if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      const dest = join(srcOut, rel);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(file, dest);
    } else if (file.endsWith('.js')) {
      const dest = join(jsOut, rel);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(file, dest);
    }
  }

  // assets/** verbatim (catalog + binaries), and examples.json.
  cpSync(resolve(examplesSrc, 'assets'), join(examplesOut, 'assets'), { recursive: true });
  cpSync(resolve(examplesSrc, 'examples.json'), join(examplesOut, 'examples.json'));
};

export interface AssembleResult {
  treeDir: string;
  treeName: string;
  forbidden: ForbiddenHit[];
}

/** Assembles the full-release directory tree (no compression yet). */
export const assembleFullReleaseTree = (options: AssembleOptions): AssembleResult => {
  const treeName = `exojs-v${options.version}-full`;
  const treeDir = resolve(options.outDir, treeName);
  rmSync(treeDir, { recursive: true, force: true });
  mkdirSync(treeDir, { recursive: true });

  // npm/ — the three official tarballs.
  const npmOut = join(treeDir, 'npm');
  for (const record of options.manifest.packages) {
    copyFile(resolve(options.stagingDir, record.file), npmOut);
  }

  // vendor/ — each package's ESM tree, taken from the built site's vendor dir.
  for (const { name, vendorDir } of VENDOR_PACKAGES) {
    const from = resolve(options.siteDistDir, 'vendor', vendorDir, 'esm');
    if (!existsSync(from)) {
      throw new Error(`[full-zip] Missing vendored ESM for ${name} at ${from}. Run "pnpm site:build" first.`);
    }
    cpSync(from, join(treeDir, 'vendor', vendorDir, 'esm'), { recursive: true });
  }

  // examples/ — src/** (TS), js/** (transpiled), assets/**, examples.json.
  assembleExamples(options.rootDir, join(treeDir, 'examples'));

  // site/ — the full built static site (servable standalone).
  cpSync(options.siteDistDir, join(treeDir, 'site'), { recursive: true });

  // Top-level metadata.
  for (const meta of ['README.md', 'CHANGELOG.md', 'LICENSE']) {
    cpSync(resolve(options.rootDir, meta), join(treeDir, meta));
  }

  // Manifest + checksums (covering the npm tarballs at their in-tree `npm/`
  // location so `sha256sum -c checksums.sha256` resolves from the tree root).
  // The `fullZip` record is stripped — the archive cannot checksum itself.
  const { fullZip: _omit, ...inTreeManifest } = options.manifest;
  writeFileSync(join(treeDir, 'release-manifest.json'), serializeManifest(inTreeManifest), 'utf8');
  writeFileSync(join(treeDir, 'checksums.sha256'), renderChecksums(options.manifest, 'npm/'), 'utf8');

  const forbidden = scanForbiddenContent(treeDir);
  return { treeDir, treeName, forbidden };
};

/**
 * Compresses the assembled tree into a `.zip` (tree contents at the archive
 * root: `npm/`, `vendor/`, `site/`, …). On Windows uses .NET `ZipFile` via
 * `pwsh` (fast + reliable for large trees, unlike `Compress-Archive`); on POSIX
 * uses `zip -r`.
 */
export const compressTree = (
  runner: CommandRunner,
  options: { treeDir: string; treeName: string; outDir: string },
): { zipPath: string; sha256: string; bytes: number } => {
  const zipPath = resolve(options.outDir, `${options.treeName}.zip`);
  rmSync(zipPath, { force: true });

  const result =
    process.platform === 'win32'
      ? runner.run({
          command: 'pwsh',
          args: [
            '-NoProfile',
            '-Command',
            `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${options.treeDir}','${zipPath}')`,
          ],
        })
      : runner.run({ command: 'zip', args: ['-r', '-q', zipPath, '.'], cwd: options.treeDir });

  if (result.code !== 0) {
    throw new Error(`[full-zip] Compression failed:\n${result.stderr || result.stdout}`);
  }
  if (!existsSync(zipPath)) {
    throw new Error(`[full-zip] Expected ${zipPath} after compression, but it is missing.`);
  }

  const { sha256, bytes } = sha256File(zipPath);
  writeFileSync(`${zipPath}.sha256`, `${sha256}  ${basename(zipPath)}\n`, 'utf8');
  return { zipPath, sha256, bytes };
};

/** Total byte size of a directory tree (for reporting). */
export const treeBytes = (dir: string): number => walk(dir).reduce((sum, file) => sum + statSync(file).size, 0);
