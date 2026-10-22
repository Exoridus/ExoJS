import { createHash } from 'node:crypto';

import { SITE_CHANNEL_BASE, type SiteChannel } from './site-channel.ts';
import type { SiteBuildManifest } from './site-manifest.ts';

/**
 * `channels.json`: what the composed Pages site contains, written by the
 * composer at the site root. It records, per channel, the commit, version,
 * content hash and base of the deployed tree and the run and artifact its
 * bytes came from.
 *
 * Dependency-free and erasable TypeScript, run by the publisher with plain
 * `node`.
 */

export const CHANNELS_FILE = 'channels.json';

export const CHANNEL_PATH: Readonly<Record<SiteChannel, '' | 'next/'>> = { stable: '', next: 'next/' };

/** Where a channel's bytes came from, as GitHub reported it. */
export interface ChannelSource {
  kind: 'ci' | 'release';
  workflowId: number;
  runId: number;
  runAttempt: number;
  artifactId: number;
  artifactName: string;
  /** `sha256:<hex>` of the artifact zip. */
  digest: string;
}

export interface ChannelEntry {
  channel: SiteChannel;
  /** Location inside the composed tree: `''` or `'next/'`. */
  path: '' | 'next/';
  basePath: string;
  sourceSha: string;
  packageVersion: string;
  assetProfile: string;
  createdAt: string;
  contentHash: string;
  fileCount: number;
  totalBytes: number;
  source: ChannelSource;
}

export interface ChannelsDocument {
  schemaVersion: 1;
  /** Identifies the pair of channel contents; equal pairings deploy nothing new. */
  pairing: string;
  channels: { stable: ChannelEntry; next: ChannelEntry | null };
}

interface ChannelRecord {
  manifest: SiteBuildManifest;
  source: ChannelSource;
}

const entryFor = (channel: SiteChannel, { manifest, source }: ChannelRecord): ChannelEntry => ({
  channel,
  path: CHANNEL_PATH[channel],
  basePath: manifest.basePath,
  sourceSha: manifest.sourceSha,
  packageVersion: manifest.packageVersion,
  assetProfile: manifest.assetProfile,
  createdAt: manifest.createdAt,
  contentHash: manifest.contentHash,
  fileCount: manifest.fileCount,
  totalBytes: manifest.totalBytes,
  source,
});

export const pairingOf = (stable: Pick<ChannelEntry, 'sourceSha' | 'contentHash'>, next: Pick<ChannelEntry, 'sourceSha' | 'contentHash'> | null): string =>
  createHash('sha256')
    .update(JSON.stringify([stable.sourceSha, stable.contentHash, next?.sourceSha ?? null, next?.contentHash ?? null]))
    .digest('hex');

export const buildChannelsDocument = (records: { stable: ChannelRecord; next: ChannelRecord | null }): ChannelsDocument => {
  const stable = entryFor('stable', records.stable);
  const next = records.next === null ? null : entryFor('next', records.next);

  return { schemaVersion: 1, pairing: pairingOf(stable, next), channels: { stable, next } };
};

export const serializeChannelsDocument = (document: ChannelsDocument): string => `${JSON.stringify(document, null, 2)}\n`;

const HEX64 = /^[0-9a-f]{64}$/;
const SHA1 = /^[0-9a-f]{40}$/;

const parseSource = (value: unknown, label: string, problems: string[]): ChannelSource | null => {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;

  const integer = (key: string): number => {
    const field = raw[key];

    if (typeof field !== 'number' || !Number.isSafeInteger(field) || field <= 0) {
      problems.push(`${label}.source.${key} is not a positive integer`);

      return 0;
    }

    return field;
  };

  if (raw['kind'] !== 'ci' && raw['kind'] !== 'release') {
    problems.push(`${label}.source.kind is not ci or release`);
  }

  if (typeof raw['artifactName'] !== 'string' || typeof raw['digest'] !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(raw['digest'])) {
    problems.push(`${label}.source needs an artifactName and a sha256 digest`);
  }

  const source: ChannelSource = {
    kind: raw['kind'] as ChannelSource['kind'],
    workflowId: integer('workflowId'),
    runId: integer('runId'),
    runAttempt: integer('runAttempt'),
    artifactId: integer('artifactId'),
    artifactName: raw['artifactName'] as string,
    digest: raw['digest'] as string,
  };

  return source;
};

const parseEntry = (value: unknown, channel: SiteChannel, problems: string[]): ChannelEntry | null => {
  if (typeof value !== 'object' || value === null) {
    problems.push(`channels.${channel} is not an object`);

    return null;
  }

  const raw = value as Record<string, unknown>;
  const label = `channels.${channel}`;

  if (raw['channel'] !== channel) {
    problems.push(`${label}.channel is not ${channel}`);
  }

  if (raw['path'] !== CHANNEL_PATH[channel]) {
    problems.push(`${label}.path is not ${JSON.stringify(CHANNEL_PATH[channel])}`);
  }

  if (raw['basePath'] !== SITE_CHANNEL_BASE[channel]) {
    problems.push(`${label}.basePath is not ${SITE_CHANNEL_BASE[channel]}`);
  }

  if (typeof raw['sourceSha'] !== 'string' || !SHA1.test(raw['sourceSha'])) {
    problems.push(`${label}.sourceSha is not a commit SHA`);
  }

  if (typeof raw['contentHash'] !== 'string' || !HEX64.test(raw['contentHash'])) {
    problems.push(`${label}.contentHash is not a SHA-256 hex digest`);
  }

  for (const key of ['packageVersion', 'assetProfile', 'createdAt']) {
    if (typeof raw[key] !== 'string') {
      problems.push(`${label}.${key} is not a string`);
    }
  }

  for (const key of ['fileCount', 'totalBytes']) {
    if (typeof raw[key] !== 'number' || !Number.isSafeInteger(raw[key]) || (raw[key] as number) < 0) {
      problems.push(`${label}.${key} is not a non-negative integer`);
    }
  }

  const source = parseSource(raw['source'], label, problems);

  return {
    channel,
    path: CHANNEL_PATH[channel],
    basePath: raw['basePath'] as string,
    sourceSha: raw['sourceSha'] as string,
    packageVersion: raw['packageVersion'] as string,
    assetProfile: raw['assetProfile'] as string,
    createdAt: raw['createdAt'] as string,
    contentHash: raw['contentHash'] as string,
    fileCount: raw['fileCount'] as number,
    totalBytes: raw['totalBytes'] as number,
    source: source as ChannelSource,
  };
};

/** Validates an untrusted, JSON-parsed `channels.json`; throws listing every problem. */
export const parseChannelsDocument = (value: unknown): ChannelsDocument => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`[compose-site] ${CHANNELS_FILE} is not a JSON object`);
  }

  const raw = value as Record<string, unknown>;
  const problems: string[] = [];
  const channels = (typeof raw['channels'] === 'object' && raw['channels'] !== null ? raw['channels'] : {}) as Record<string, unknown>;

  if (raw['schemaVersion'] !== 1) {
    problems.push('schemaVersion is not 1');
  }

  if (typeof raw['pairing'] !== 'string' || !HEX64.test(raw['pairing'])) {
    problems.push('pairing is not a SHA-256 hex digest');
  }

  const stable = channels['stable'] == null ? null : parseEntry(channels['stable'], 'stable', problems);
  const next = channels['next'] == null ? null : parseEntry(channels['next'], 'next', problems);

  if (stable === null) {
    problems.push('channels.stable is missing; Stable is always published');
  }

  if (stable !== null && raw['pairing'] !== pairingOf(stable, next)) {
    problems.push('pairing does not match the channel identities');
  }

  if (problems.length > 0) {
    throw new Error(`[compose-site] invalid ${CHANNELS_FILE}:\n  ${problems.join('\n  ')}`);
  }

  return { schemaVersion: 1, pairing: raw['pairing'] as string, channels: { stable: stable!, next } };
};
