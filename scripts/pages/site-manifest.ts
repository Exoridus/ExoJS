import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isSafeBasePath, SITE_CHANNEL_BASE, SITE_CHANNELS, type SiteChannel } from './site-channel.ts';

/**
 * `site-build.json`: the identity and the exact content of one built channel
 * tree. It sits at the tree root and is not part of its own file list.
 *
 * Dependency-free and erasable TypeScript, so the Pages publisher can run it
 * with plain `node`.
 */

export const SITE_BUILD_FILE = 'site-build.json';

export const SITE_BUILD_SCHEMA_VERSION = 1;

/**
 * Which demo media profile the build ships. `standard` is the
 * `@codexo/exojs-demo-assets` standard profile served under
 * `vendor/exojs-demo-assets/media/`; the extended media are not part of a site.
 */
export const SITE_ASSET_PROFILES = ['standard'] as const;

export type SiteAssetProfile = (typeof SITE_ASSET_PROFILES)[number];

export interface SiteBuildIdentity {
  channel: SiteChannel;
  basePath: string;
  /** The commit the tree was built from. */
  sourceSha: string;
  /** The root package version the tree was built from, unreleased or not. */
  packageVersion: string;
  assetProfile: SiteAssetProfile;
  /** ISO 8601 UTC build time. */
  createdAt: string;
  /** Built for a non-canonical base; the publisher refuses it. */
  localTest: boolean;
}

export interface SiteBuildFileEntry {
  path: string;
  size: number;
  sha256: string;
}

export interface SiteBuildManifest extends SiteBuildIdentity {
  schemaVersion: typeof SITE_BUILD_SCHEMA_VERSION;
  fileCount: number;
  totalBytes: number;
  /** SHA-256 over the sorted file list; see `computeContentHash`. */
  contentHash: string;
  files: SiteBuildFileEntry[];
}

const SHA1_HEX = /^[0-9a-f]{40}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
// Control characters, the Windows separator and the drive/stream separator.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_PATH_CHARACTERS = /[\u0000-\u001F\u007F\\:]/;

/**
 * Why `path` cannot name a file in a site tree, or `null` when it can. A site
 * path is relative, POSIX-separated and has no empty, `.` or `..` segment,
 * so it can neither escape the tree nor alias another entry.
 */
export const validateSitePath = (path: string): string | null => {
  if (path === '') {
    return 'empty path';
  }

  if (path.startsWith('/')) {
    return `absolute path ${JSON.stringify(path)}`;
  }

  if (FORBIDDEN_PATH_CHARACTERS.test(path)) {
    return `path with a control character, backslash or colon ${JSON.stringify(path)}`;
  }

  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') {
      return `path with an empty, '.' or '..' segment ${JSON.stringify(path)}`;
    }
  }

  return null;
};

const compareCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const sha256 = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');

/**
 * Every regular file below `root`, sorted by code unit, with size and SHA-256.
 * Throws on a symbolic link or any other non-regular entry, and on a name that
 * is not a valid site path. `exclude` receives root-relative paths.
 */
export const hashTreeFiles = (root: string, exclude: (path: string) => boolean = () => false): SiteBuildFileEntry[] => {
  const files: SiteBuildFileEntry[] = [];

  const visit = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      const problem = validateSitePath(rel);

      if (problem !== null) {
        throw new Error(`[site-manifest] ${problem}`);
      }

      const abs = join(directory, entry.name);
      const stats = lstatSync(abs);

      if (stats.isSymbolicLink()) {
        throw new Error(`[site-manifest] symlink in the site tree: ${rel}`);
      }

      if (stats.isDirectory()) {
        visit(abs, rel);
        continue;
      }

      if (!stats.isFile()) {
        throw new Error(`[site-manifest] special file in the site tree: ${rel}`);
      }

      if (exclude(rel)) {
        continue;
      }

      files.push({ path: rel, size: stats.size, sha256: sha256(readFileSync(abs)) });
    }
  };

  visit(root, '');

  return files.sort((a, b) => compareCodeUnits(a.path, b.path));
};

/** SHA-256 over one `<sha256> <size> <path>\n` line per file, in list order. */
export const computeContentHash = (files: readonly SiteBuildFileEntry[]): string =>
  sha256(files.map(file => `${file.sha256} ${file.size} ${file.path}\n`).join(''));

const isRootManifest = (path: string): boolean => path === SITE_BUILD_FILE;

const identityProblems = (identity: SiteBuildIdentity): string[] => {
  const problems: string[] = [];

  if (!(SITE_CHANNELS as readonly string[]).includes(identity.channel)) {
    problems.push(`channel ${JSON.stringify(identity.channel)} is not a site channel`);
  }

  if (typeof identity.basePath !== 'string' || !isSafeBasePath(identity.basePath)) {
    problems.push(`basePath ${JSON.stringify(identity.basePath)} is not a safe base path`);
  } else if (typeof identity.localTest !== 'boolean') {
    problems.push('localTest must be a boolean');
  } else if (!identity.localTest && SITE_CHANNEL_BASE[identity.channel] !== identity.basePath) {
    problems.push(`basePath ${identity.basePath} is not the ${identity.channel} base ${SITE_CHANNEL_BASE[identity.channel]}`);
  }

  if (typeof identity.sourceSha !== 'string' || !SHA1_HEX.test(identity.sourceSha)) {
    problems.push(`sourceSha ${JSON.stringify(identity.sourceSha)} is not a full commit SHA`);
  }

  if (typeof identity.packageVersion !== 'string' || !SEMVER.test(identity.packageVersion)) {
    problems.push(`packageVersion ${JSON.stringify(identity.packageVersion)} is not a semantic version`);
  }

  if (!(SITE_ASSET_PROFILES as readonly string[]).includes(identity.assetProfile)) {
    problems.push(`assetProfile ${JSON.stringify(identity.assetProfile)} is not one of ${SITE_ASSET_PROFILES.join(', ')}`);
  }

  if (typeof identity.createdAt !== 'string' || !ISO_UTC.test(identity.createdAt) || Number.isNaN(Date.parse(identity.createdAt))) {
    problems.push(`createdAt ${JSON.stringify(identity.createdAt)} is not an ISO 8601 UTC time`);
  }

  return problems;
};

/** Throws when `identity` could not describe a build of the declared channel. */
export const assertSiteBuildIdentity = (identity: SiteBuildIdentity): void => {
  const problems = identityProblems(identity);

  if (problems.length > 0) {
    throw new Error(`[site-manifest] invalid site build identity:\n  ${problems.join('\n  ')}`);
  }
};

/** The manifest of the tree at `root`, excluding a `site-build.json` at its root. */
export const createSiteBuildManifest = (root: string, identity: SiteBuildIdentity): SiteBuildManifest => {
  assertSiteBuildIdentity(identity);
  const files = hashTreeFiles(root, isRootManifest);

  return {
    schemaVersion: SITE_BUILD_SCHEMA_VERSION,
    channel: identity.channel,
    basePath: identity.basePath,
    sourceSha: identity.sourceSha,
    packageVersion: identity.packageVersion,
    assetProfile: identity.assetProfile,
    createdAt: identity.createdAt,
    localTest: identity.localTest,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    contentHash: computeContentHash(files),
    files,
  };
};

/** Serialized form, stable for a given manifest. */
export const serializeSiteBuildManifest = (manifest: SiteBuildManifest): string => `${JSON.stringify(manifest, null, 2)}\n`;

/**
 * Validates an untrusted, already JSON-parsed manifest. Throws listing every
 * problem; the returned value is a fresh object with exactly the known fields.
 */
export const parseSiteBuildManifest = (value: unknown): SiteBuildManifest => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`[site-manifest] ${SITE_BUILD_FILE} is not a JSON object`);
  }

  const raw = value as Record<string, unknown>;
  const problems: string[] = [];

  if (raw['schemaVersion'] !== SITE_BUILD_SCHEMA_VERSION) {
    problems.push(`schemaVersion ${JSON.stringify(raw['schemaVersion'])} is not ${SITE_BUILD_SCHEMA_VERSION}`);
  }

  const identity = {
    channel: raw['channel'],
    basePath: raw['basePath'],
    sourceSha: raw['sourceSha'],
    packageVersion: raw['packageVersion'],
    assetProfile: raw['assetProfile'],
    createdAt: raw['createdAt'],
    localTest: raw['localTest'],
  } as SiteBuildIdentity;

  problems.push(...identityProblems(identity));

  const files: SiteBuildFileEntry[] = [];

  if (!Array.isArray(raw['files'])) {
    problems.push('files is not an array');
  } else {
    let previous: string | null = null;

    for (const [index, entry] of (raw['files'] as unknown[]).entries()) {
      const file = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
      const path = file['path'];
      const size = file['size'];
      const hash = file['sha256'];

      if (typeof path !== 'string' || validateSitePath(path) !== null) {
        problems.push(`files[${index}].path: ${typeof path === 'string' ? validateSitePath(path) : 'not a string'}`);
        continue;
      }

      if (path === SITE_BUILD_FILE) {
        problems.push(`files[${index}] lists ${SITE_BUILD_FILE} itself`);
      }

      if (previous !== null && compareCodeUnits(previous, path) >= 0) {
        problems.push(`files[${index}] ${path} is not sorted after ${previous} or is a duplicate`);
      }

      if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) {
        problems.push(`files[${index}].size is not a non-negative integer`);
      }

      if (typeof hash !== 'string' || !SHA256_HEX.test(hash)) {
        problems.push(`files[${index}].sha256 is not a SHA-256 hex digest`);
      }

      previous = path;
      files.push({ path, size: size as number, sha256: hash as string });
    }
  }

  if (raw['fileCount'] !== files.length) {
    problems.push(`fileCount ${JSON.stringify(raw['fileCount'])} does not match the ${files.length} listed files`);
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  if (raw['totalBytes'] !== totalBytes) {
    problems.push(`totalBytes ${JSON.stringify(raw['totalBytes'])} does not match the listed sizes (${totalBytes})`);
  }

  const contentHash = computeContentHash(files);

  if (raw['contentHash'] !== contentHash) {
    problems.push(`contentHash ${JSON.stringify(raw['contentHash'])} does not match the file list (${contentHash})`);
  }

  if (problems.length > 0) {
    throw new Error(`[site-manifest] invalid ${SITE_BUILD_FILE}:\n  ${problems.join('\n  ')}`);
  }

  return {
    schemaVersion: SITE_BUILD_SCHEMA_VERSION,
    ...identity,
    fileCount: files.length,
    totalBytes,
    contentHash,
    files,
  };
};

/** Reads and validates `<root>/site-build.json`. */
export const readSiteBuildManifest = (root: string): SiteBuildManifest =>
  parseSiteBuildManifest(JSON.parse(readFileSync(join(root, SITE_BUILD_FILE), 'utf8')) as unknown);

export interface VerifySiteTreeOptions {
  /** Root-relative paths that may exist beside the manifest's files. */
  allowExtra?: (path: string) => boolean;
}

/**
 * Every difference between the tree at `root` and `manifest`: a missing,
 * unexpected or altered file, or an unsafe entry. Empty when they match.
 */
export const verifySiteTree = (root: string, manifest: SiteBuildManifest, options: VerifySiteTreeOptions = {}): string[] => {
  const allowExtra = options.allowExtra ?? (() => false);
  let actual: SiteBuildFileEntry[];

  try {
    actual = hashTreeFiles(root, path => isRootManifest(path) || allowExtra(path));
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  const problems: string[] = [];
  const actualByPath = new Map(actual.map(file => [file.path, file]));

  for (const expected of manifest.files) {
    const found = actualByPath.get(expected.path);

    if (found === undefined) {
      problems.push(`missing file ${expected.path}`);
    } else if (found.size !== expected.size || found.sha256 !== expected.sha256) {
      problems.push(`altered file ${expected.path}`);
    }

    actualByPath.delete(expected.path);
  }

  for (const path of actualByPath.keys()) {
    problems.push(`unexpected file ${path}`);
  }

  if (computeContentHash(manifest.files) !== manifest.contentHash) {
    problems.push('contentHash does not match the manifest file list');
  }

  return problems;
};
