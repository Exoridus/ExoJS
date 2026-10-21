/**
 * The legacy shim packages: generated forwarders that keep the seven retired
 * runtime package names importable on the 0.20 line.
 *
 *   tsx scripts/release/legacy-shims.ts           # write every shim package
 *   tsx scripts/release/legacy-shims.ts --check   # exit 1 if any file differs
 *
 * Every file of a shim package is generated from the release matrix
 * (`LEGACY_SHIMS`), so the seven packages cannot drift apart. Only `version`
 * and the Core peer range are owned by the release cut: the generator keeps
 * whatever the manifest on disk carries, and a new shim starts on the lockstep
 * version.
 *
 * The files are committed rather than built: a release packs with
 * `--ignore-scripts`, and a forwarder has nothing to compile.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEGACY_SHIMS, type LegacyShim, type LegacyShimEntry } from './lockstep-packages.ts';
import { deprecationMessage } from './registry-plan.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const REPOSITORY_URL = 'git+https://github.com/Exoridus/ExoJS.git';

/** `MAJOR.MINOR` of an exact version. */
export const lineOf = (version: string): string => version.split('.').slice(0, 2).join('.');

/** The Core peer range a shim at `version` declares. */
export const shimPeerRange = (version: string): string => `${lineOf(version)}.x`;

const entryFileBase = (entry: LegacyShimEntry): string => (entry.entry === '.' ? 'index' : entry.entry.slice(2));

const forwarderSource = (entry: LegacyShimEntry, declaration: boolean): string => {
  if (entry.names === undefined) {
    return `export * from '${entry.target}';\n`;
  }

  const names = declaration ? [...entry.names.values, ...entry.names.types.map(name => `type ${name}`)] : entry.names.values;

  return `export { ${names.join(', ')} } from '${entry.target}';\n`;
};

const readme = (shim: LegacyShim): string => {
  const rows = shim.entries.map(entry => {
    const from = entry.entry === '.' ? shim.name : `${shim.name}/${entry.entry.slice(2)}`;
    const forwarded =
      entry.names === undefined ? 'everything' : [...entry.names.values, ...entry.names.types].map(name => `\`${name}\``).join(', ');

    return `| \`${from}\` | \`${entry.target}\` | ${forwarded} |`;
  });

  return [
    `# ${shim.name}`,
    '',
    `${deprecationMessage(shim.subpath)}`,
    '',
    `Every export of this package is the very binding its Core entry exports, so code that still imports \`${shim.name}\` shares one engine instance with code that already imports \`@codexo/exojs/${shim.subpath}\`. The package contains no implementation of its own and depends on nothing but its \`@codexo/exojs\` peer.`,
    '',
    '| Import | Replace with | Forwards |',
    '| --- | --- | --- |',
    ...rows,
    '',
    '## Migrating',
    '',
    `Change each import to the Core entry in the table, then remove this package with \`npm uninstall ${shim.name}\`. \`@codexo/exojs\` already contains the module; there is nothing else to install. The migration guide on the ExoJS site lists every renamed import.`,
    '',
  ].join('\n');
};

const manifest = (shim: LegacyShim, version: string, peerRange: string): string => {
  const exportsMap: Record<string, unknown> = {};
  const files: string[] = [];

  for (const entry of shim.entries) {
    const base = entryFileBase(entry);
    exportsMap[entry.entry] = { types: `./${base}.d.ts`, import: `./${base}.js`, default: `./${base}.js` };
    files.push(`${base}.js`, `${base}.d.ts`);
  }

  exportsMap['./package.json'] = './package.json';

  return `${JSON.stringify(
    {
      name: shim.name,
      version,
      description: `Compatibility shim that forwards to @codexo/exojs/${shim.subpath}. Since ExoJS v0.20, import from @codexo/exojs/${shim.subpath}.`,
      repository: { type: 'git', url: REPOSITORY_URL, directory: shim.dir },
      type: 'module',
      sideEffects: false,
      main: './index.js',
      types: './index.d.ts',
      exports: exportsMap,
      files: [...files, 'README.md', 'LICENSE'],
      peerDependencies: { '@codexo/exojs': peerRange },
      // Satisfies the peer inside the workspace, where pnpm would otherwise try
      // to install the peer range from the registry. Never installed for a
      // consumer, and packing rewrites it to the exact Core version.
      devDependencies: { '@codexo/exojs': 'workspace:*' },
      license: 'MIT',
      publishConfig: { access: 'public' },
    },
    null,
    2,
  )}\n`;
};

/** Lockstep version every new shim starts on. */
const lockstepVersion = (): string => (JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as { version: string }).version;

/** The version and peer range the shim manifest on disk carries, or the lockstep start values for a new shim. */
export const currentShimVersion = (shim: LegacyShim, rootDir = repoRoot): { version: string; peerRange: string } => {
  const path = resolve(rootDir, shim.dir, 'package.json');

  if (!existsSync(path)) {
    const version = lockstepVersion();

    return { version, peerRange: shimPeerRange(version) };
  }

  const pkg = JSON.parse(readFileSync(path, 'utf8')) as { version: string; peerDependencies?: Record<string, string> };

  return { version: pkg.version, peerRange: pkg.peerDependencies?.['@codexo/exojs'] ?? shimPeerRange(pkg.version) };
};

/** Every file of a shim package, by path relative to the package directory. */
export const shimFiles = (shim: LegacyShim, options: { version: string; peerRange: string; license: string }): Map<string, string> => {
  const files = new Map<string, string>();
  files.set('package.json', manifest(shim, options.version, options.peerRange));

  for (const entry of shim.entries) {
    const base = entryFileBase(entry);
    files.set(`${base}.js`, forwarderSource(entry, false));
    files.set(`${base}.d.ts`, forwarderSource(entry, true));
  }

  files.set('README.md', readme(shim));
  files.set('LICENSE', options.license);

  return files;
};

/**
 * Hash of what a shim forwards: its export map and forwarder files. The
 * version, peer range, README and LICENSE are left out - a change there is no
 * reason to publish a new version of the shim.
 */
export const forwarderFingerprint = (files: ReadonlyMap<string, string>): string => {
  const hash = createHash('sha256');
  const pkg = JSON.parse(files.get('package.json') ?? '{}') as { exports?: unknown };
  hash.update(JSON.stringify(pkg.exports ?? null));

  for (const path of [...files.keys()].filter(path => /\.(?:js|d\.ts)$/.test(path)).sort()) {
    hash.update(`\0${path}\0${files.get(path) ?? ''}`);
  }

  return hash.digest('hex');
};

/**
 * The published files of a shim as `read` returns them (`undefined` for a
 * missing file), or `undefined` when the shim has no manifest there.
 */
export const readShimFiles = (read: (path: string) => string | undefined): Map<string, string> | undefined => {
  const manifestText = read('package.json');

  if (manifestText === undefined) {
    return undefined;
  }

  const files = new Map<string, string>([['package.json', manifestText]]);

  for (const path of (JSON.parse(manifestText) as { files?: string[] }).files ?? []) {
    files.set(path, read(path) ?? '');
  }

  return files;
};

/**
 * Whether a shim's forwarders differ from the ones published under
 * `currentVersion`, read from that version's release tag. A shim with no tagged
 * files counts as changed: nothing proves what that version forwarded.
 */
export const shimForwarderChanged = (rootDir: string, dir: string, currentVersion: string): boolean => {
  const fromTag = readShimFiles(path => {
    try {
      return execFileSync('git', ['show', `v${currentVersion}:${dir}/${path}`], { encoding: 'utf8', stdio: 'pipe', cwd: rootDir });
    } catch {
      return;
    }
  });
  const onDisk = readShimFiles(path => {
    try {
      return readFileSync(resolve(rootDir, dir, path), 'utf8');
    } catch {
      return;
    }
  });

  return fromTag === undefined || onDisk === undefined || forwarderFingerprint(fromTag) !== forwarderFingerprint(onDisk);
};

export type ShimCutDecision =
  | { readonly action: 'set'; readonly version: string; readonly peerRange: string; readonly reason: string }
  | { readonly action: 'keep'; readonly reason: string };

/**
 * What the release cut to `releaseVersion` does to a shim currently at
 * `currentVersion`. A shim is set to the release version when the cut opens
 * its line, or when its forwarders changed since the version it is on;
 * otherwise it keeps its version and is not republished. A cut on any other
 * line never touches it: earlier lines are history, later ones are not
 * promised.
 */
export const planShimCut = (input: {
  readonly line: string;
  readonly currentVersion: string;
  readonly releaseVersion: string;
  readonly forwarderChanged: boolean;
}): ShimCutDecision => {
  const releaseLine = lineOf(input.releaseVersion);

  if (releaseLine !== input.line) {
    return { action: 'keep', reason: `the cut is on ${releaseLine}, the shim serves ${input.line} only` };
  }

  if (lineOf(input.currentVersion) !== input.line) {
    return {
      action: 'set',
      version: input.releaseVersion,
      peerRange: shimPeerRange(input.releaseVersion),
      reason: `first release on the ${input.line} line`,
    };
  }

  if (input.forwarderChanged) {
    return {
      action: 'set',
      version: input.releaseVersion,
      peerRange: shimPeerRange(input.releaseVersion),
      reason: `forwarders changed since ${input.currentVersion}`,
    };
  }

  return { action: 'keep', reason: `forwarders unchanged since ${input.currentVersion}; not republished` };
};

/** Whether a shim at `version` is published by the release of `releaseVersion`. */
export const isShimDue = (shim: { readonly line: string }, version: string, releaseVersion: string): boolean =>
  version === releaseVersion && lineOf(version) === shim.line;

/** What the release of a version does with one shim, as the registry plan reports it. */
export interface ShimReleaseStatus {
  readonly name: string;
  readonly subpath: string;
  readonly line: string;
  /** The version the shim manifest carries now. */
  readonly currentVersion: string;
  /** The version the release publishes, or the one the shim keeps. */
  readonly version: string;
  readonly publish: boolean;
  readonly reason: string;
  /** {@link forwarderFingerprint} of the files on disk. */
  readonly fingerprint: string;
}

/**
 * The release status of `shim` for `releaseVersion`: published when the cut set
 * (or, run before the cut, would set) its version to the release, kept
 * otherwise.
 */
export const shimReleaseStatus = (rootDir: string, shim: LegacyShim, releaseVersion: string): ShimReleaseStatus => {
  const files = readShimFiles(path => {
    try {
      return readFileSync(resolve(rootDir, shim.dir, path), 'utf8');
    } catch {
      return;
    }
  });

  if (files === undefined) {
    throw new Error(`${shim.name}: no package at ${shim.dir}; run pnpm legacy-shims:generate`);
  }

  const currentVersion = (JSON.parse(files.get('package.json') ?? '{}') as { version: string }).version;
  const base = { name: shim.name, subpath: shim.subpath, line: shim.line, currentVersion, fingerprint: forwarderFingerprint(files) };

  if (isShimDue(shim, currentVersion, releaseVersion)) {
    return { ...base, version: currentVersion, publish: true, reason: `the cut set it to ${releaseVersion}` };
  }

  const decision = planShimCut({
    line: shim.line,
    currentVersion,
    releaseVersion,
    forwarderChanged: lineOf(currentVersion) === shim.line && shimForwarderChanged(rootDir, shim.dir, currentVersion),
  });

  return decision.action === 'set'
    ? { ...base, version: decision.version, publish: true, reason: `${decision.reason}; the cut sets ${decision.version}` }
    : { ...base, version: currentVersion, publish: false, reason: decision.reason };
};

/** Writes (or, with `check`, compares) every shim package. Returns the paths that differ. */
export const syncLegacyShims = (options: { readonly check: boolean; readonly rootDir?: string }): string[] => {
  const rootDir = options.rootDir ?? repoRoot;
  const license = readFileSync(resolve(rootDir, 'LICENSE'), 'utf8');
  const differing: string[] = [];

  for (const shim of LEGACY_SHIMS) {
    const dir = resolve(rootDir, shim.dir);
    const files = shimFiles(shim, { ...currentShimVersion(shim, rootDir), license });

    for (const [path, content] of files) {
      const target = join(dir, path);
      const current = existsSync(target) ? readFileSync(target, 'utf8') : undefined;

      if (current === content) {
        continue;
      }

      differing.push(`${shim.dir}/${path}`);

      if (!options.check) {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content);
      }
    }
  }

  return differing;
};

if (import.meta.url.startsWith('file:') && fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  const check = process.argv.includes('--check');
  const differing = syncLegacyShims({ check });

  if (check && differing.length > 0) {
    console.error(
      `legacy-shims: ${differing.length} file(s) differ from the release matrix:\n${differing.map(path => `  - ${path}`).join('\n')}`,
    );
    console.error('\nRegenerate with: pnpm legacy-shims:generate');
    process.exit(1);
  }

  console.log(
    check
      ? `legacy-shims: ${LEGACY_SHIMS.length} shim packages match the release matrix.`
      : `legacy-shims: ${differing.length} file(s) written for ${LEGACY_SHIMS.length} shim packages.`,
  );
}
