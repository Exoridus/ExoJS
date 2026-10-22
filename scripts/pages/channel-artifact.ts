import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { checkTreeSafety, extractZip } from './archive-safety.ts';
import { evaluateSiteSize, SITE_SIZE_REFUSE_BYTES } from './site-budget.ts';
import { SITE_CHANNEL_BASE, SITE_CHANNELS, type SiteChannel } from './site-channel.ts';
import { readSiteBuildManifest, SITE_BUILD_FILE, type SiteBuildManifest, verifySiteTree } from './site-manifest.ts';

/**
 * One channel candidate: the zip of a built site tree with its
 * `site-build.json`, uploaded by CI or Release as `site-<channel>-<sha>-<attempt>`.
 *
 * Dependency-free and erasable TypeScript, run by CI after the site build and
 * by the publisher with plain `node`.
 */

const CANDIDATE_NAME = /^site-(stable|next)-([0-9a-f]{40})-([1-9][0-9]{0,3})$/;

/** The artifact name a run uploads its channel tree under. */
export const candidateArtifactName = (channel: SiteChannel, sha: string, attempt: number): string => `site-${channel}-${sha}-${attempt}`;

export const parseCandidateArtifactName = (name: string): { channel: SiteChannel; sha: string; attempt: number } | null => {
  const match = CANDIDATE_NAME.exec(name);

  return match === null ? null : { channel: match[1] as SiteChannel, sha: match[2]!, attempt: Number(match[3]) };
};

/** Why `bytes` do not match the `sha256:<hex>` digest GitHub reported, or `null`. */
export const verifyDigest = (bytes: Buffer, digest: string): string | null => {
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    return `artifact digest ${JSON.stringify(digest)} is not a sha256 digest`;
  }

  const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

  return actual === digest ? null : `artifact digest mismatch: GitHub reported ${digest}, the download hashes to ${actual}`;
};

export interface ExpectedChannel {
  channel: SiteChannel;
  sourceSha: string;
  /** Also require this exact content, for a snapshot that is being kept. */
  contentHash?: string;
}

/** Checks a channel tree on disk against its manifest and the identity it must have. */
export const verifyChannelTree = (dir: string, expected: ExpectedChannel): { problems: string[]; manifest: SiteBuildManifest | null } => {
  let manifest: SiteBuildManifest;

  try {
    manifest = readSiteBuildManifest(dir);
  } catch (error) {
    return { problems: [`${SITE_BUILD_FILE}: ${error instanceof Error ? error.message : String(error)}`], manifest: null };
  }

  const problems: string[] = [];

  if (manifest.channel !== expected.channel) {
    problems.push(`channel ${manifest.channel} is not the expected ${expected.channel}`);
  }

  if (manifest.localTest) {
    problems.push(`the tree is a local test build for ${manifest.basePath}`);
  } else if (manifest.basePath !== SITE_CHANNEL_BASE[expected.channel]) {
    problems.push(`basePath ${manifest.basePath} is not the ${expected.channel} base`);
  }

  if (manifest.sourceSha !== expected.sourceSha) {
    problems.push(`sourceSha ${manifest.sourceSha} is not the run's commit ${expected.sourceSha}`);
  }

  if (expected.contentHash !== undefined && manifest.contentHash !== expected.contentHash) {
    problems.push(`contentHash ${manifest.contentHash} is not the published ${expected.contentHash}`);
  }

  problems.push(...verifySiteTree(dir, manifest), ...checkTreeSafety(dir));

  return { problems, manifest };
};

const CHANNEL_LIMITS = { maxUnpackedBytes: SITE_SIZE_REFUSE_BYTES };

/**
 * Verifies a downloaded candidate zip against its reported digest, unpacks it
 * into `outDir` after inspecting every entry, and checks the unpacked tree.
 * Throws on any problem.
 */
export const openChannelArchive = (zip: Buffer, options: ExpectedChannel & { digest: string; outDir: string }): { manifest: SiteBuildManifest } => {
  const digestProblem = verifyDigest(zip, options.digest);

  if (digestProblem !== null) {
    throw new Error(`[channel-artifact] ${digestProblem}`);
  }

  extractZip(zip, options.outDir, CHANNEL_LIMITS);
  const { problems, manifest } = verifyChannelTree(options.outDir, options);

  if (problems.length > 0 || manifest === null) {
    throw new Error(`[channel-artifact] ${options.channel} candidate refused:\n  ${problems.join('\n  ')}`);
  }

  return { manifest };
};

const argument = (name: string): string => {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`[channel-artifact] missing ${name}`);
  }

  return value;
};

/**
 * `verify --dir <tree> --channel <channel> --sha <commit>`: the check CI runs
 * on its freshly built tree before uploading it as a candidate.
 */
const main = (): void => {
  if (process.argv[2] !== 'verify') {
    throw new Error('[channel-artifact] usage: channel-artifact.ts verify --dir <tree> --channel <stable|next> --sha <commit>');
  }

  const channel = argument('--channel');

  if (!(SITE_CHANNELS as readonly string[]).includes(channel)) {
    throw new Error(`[channel-artifact] unknown channel ${JSON.stringify(channel)}`);
  }

  const dir = argument('--dir');
  const { problems, manifest } = verifyChannelTree(dir, { channel: channel as SiteChannel, sourceSha: argument('--sha') });
  const budget = evaluateSiteSize(manifest?.totalBytes ?? 0);

  if (budget.level === 'refuse') {
    problems.push(`the ${channel} tree alone: ${budget.message}`);
  } else if (budget.level === 'warn') {
    console.log(`::warning::The ${channel} site tree alone: ${budget.message}`);
  }

  if (problems.length > 0 || manifest === null) {
    throw new Error(`[channel-artifact] the ${channel} tree is not a publishable candidate:\n  ${problems.join('\n  ')}`);
  }

  console.log(
    `[channel-artifact] ${channel} ${manifest.basePath} ${manifest.sourceSha} ${manifest.packageVersion}: ` +
      `${manifest.fileCount} files, ${manifest.totalBytes} bytes, content ${manifest.contentHash}`,
  );
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
