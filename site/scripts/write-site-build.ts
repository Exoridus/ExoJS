import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { counterpartBasePath, resolveSiteChannel } from '../../scripts/pages/site-channel.ts';
import {
  assertSiteBuildIdentity,
  createSiteBuildManifest,
  serializeSiteBuildManifest,
  SITE_BUILD_FILE,
  type SiteBuildIdentity,
} from '../../scripts/pages/site-manifest.ts';

/**
 * The identity of a site build and the step that turns it into the finished
 * `site-build.json`.
 *
 * The Astro config resolves the identity once, renders it into the pages and
 * leaves it in `dist/site-build.json` as a provisional record; after Pagefind
 * has written its index, this script lists and hashes the finished tree and
 * replaces the record with the manifest. The identity is therefore decided
 * exactly once per build, and the manifest covers every file Pages will
 * serve.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const distDir = resolve(here, '..', 'dist');

export interface SiteBuildInfo extends SiteBuildIdentity {
  /** Base of the other channel for the explicit channel switch; `null` for a local test base. */
  counterpartBase: string | null;
}

type Env = Readonly<Record<string, string | undefined>>;

const resolveSourceSha = (env: Env): string => {
  const pinned = env['EXOJS_SITE_SOURCE_SHA'];

  if (pinned !== undefined && pinned !== '') {
    return pinned;
  }

  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
};

/**
 * The identity of the build the current environment describes. Throws when
 * the channel contract or any identity field is invalid.
 */
export const resolveSiteBuild = (env: Env): SiteBuildInfo => {
  const channel = resolveSiteChannel(env);
  const rootPackage = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { version?: string };
  const identity: SiteBuildIdentity = {
    channel: channel.channel,
    basePath: channel.basePath,
    sourceSha: resolveSourceSha(env),
    packageVersion: rootPackage.version ?? '',
    assetProfile: 'standard',
    createdAt: env['EXOJS_SITE_BUILD_TIME'] || new Date().toISOString(),
    localTest: channel.localTest,
  };
  assertSiteBuildIdentity(identity);

  return { ...identity, counterpartBase: counterpartBasePath(channel) };
};

const PROVISIONAL_MARKER = 'provisional';

/** Leaves the identity in the built tree for `finalizeSiteBuild`. */
export const writeProvisionalSiteBuild = (dir: string, info: SiteBuildInfo): void => {
  const { counterpartBase: _counterpartBase, ...identity } = info;
  writeFileSync(join(dir, SITE_BUILD_FILE), `${JSON.stringify({ [PROVISIONAL_MARKER]: true, ...identity }, null, 2)}\n`);
};

/**
 * Replaces the provisional record in `dir` with the manifest of the finished
 * tree. Refuses a tree whose entry page was rendered for another base.
 */
export const finalizeSiteBuild = (dir: string): void => {
  const record = JSON.parse(readFileSync(join(dir, SITE_BUILD_FILE), 'utf8')) as Record<string, unknown>;

  if (record[PROVISIONAL_MARKER] !== true) {
    throw new Error(`[site-build] ${join(dir, SITE_BUILD_FILE)} is not the provisional record of an Astro build; run the whole site build`);
  }

  const { [PROVISIONAL_MARKER]: _marker, ...identity } = record;
  assertSiteBuildIdentity(identity as unknown as SiteBuildIdentity);
  const { basePath } = identity as unknown as SiteBuildIdentity;
  const entry = readFileSync(join(dir, 'index.html'), 'utf8');

  if (!entry.includes(`const baseUrl = ${JSON.stringify(basePath)}`)) {
    throw new Error(`[site-build] index.html was not rendered for the recorded base ${basePath}`);
  }

  const manifest = createSiteBuildManifest(dir, identity as unknown as SiteBuildIdentity);
  writeFileSync(join(dir, SITE_BUILD_FILE), serializeSiteBuildManifest(manifest));
  console.log(
    `[site-build] ${manifest.channel} ${manifest.basePath} ${manifest.sourceSha.slice(0, 12)} ${manifest.packageVersion}: ` +
      `${manifest.fileCount} files, ${manifest.totalBytes} bytes`,
  );
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  finalizeSiteBuild(distDir);
}
