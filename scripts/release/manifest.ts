/**
 * Release manifest: the contract between the build-once `prepare` stage and the
 * `publish` stage.
 *
 * `prepare` packs one npm tarball per lockstep package, hashes them, and records the
 * digests here. `publish` re-hashes the on-disk tarballs and refuses to proceed
 * if any digest drifts from the manifest — that is the build-once guarantee:
 * the artifacts that were built, hashed and externally tested are byte-for-byte
 * the artifacts that get published. No build may happen between the two stages.
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

import { LOCKSTEP_PACKAGES, type OfficialPackageName } from './lockstep-packages.ts';

/** Lockstep publish order — Core first (peer of the extensions), then the extensions. */
export const PUBLISH_ORDER: readonly OfficialPackageName[] = LOCKSTEP_PACKAGES.map(p => p.name);

export type { OfficialPackageName };

export interface TarballRecord {
  name: OfficialPackageName;
  version: string;
  /** Tarball path relative to the manifest's directory (portable across machines). */
  file: string;
  sha256: string;
  bytes: number;
}

export interface FullZipRecord {
  file: string;
  sha256: string;
  bytes: number;
}

export interface ReleaseManifest {
  version: string;
  /** Full source-control revision SHA (40 hex chars). */
  revision: string;
  /** Short revision for display (7 hex chars). Never ends with `-dirty` in a release. */
  shortRevision: string;
  tag: string;
  generatedAt: string;
  publishOrder: ReadonlyArray<OfficialPackageName>;
  packages: TarballRecord[];
  fullZip?: FullZipRecord;
}

export const sha256File = (absolutePath: string): { sha256: string; bytes: number } => {
  const buffer = readFileSync(absolutePath);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  return { sha256, bytes: statSync(absolutePath).size };
};

export interface DriftIssue {
  file: string;
  reason: 'missing' | 'size-mismatch' | 'hash-mismatch';
  expected?: string;
  actual?: string;
}

/**
 * Re-hashes the npm tarballs referenced by the manifest against the files on
 * disk and reports any drift. An empty array means the tarballs are
 * byte-identical to what `prepare` recorded — the build-once invariant the
 * publish stage relies on. The full-release ZIP is a GitHub release asset (not
 * published to npm) and is excluded here; it carries its own `.sha256` sidecar.
 *
 * @param manifest parsed release manifest
 * @param resolve maps a manifest-relative tarball `file` to an absolute path
 */
export const verifyManifestArtifacts = (manifest: ReleaseManifest, resolve: (relativeFile: string) => string): DriftIssue[] => {
  const issues: DriftIssue[] = [];

  for (const record of manifest.packages) {
    const absolutePath = resolve(record.file);
    let actual: { sha256: string; bytes: number };
    try {
      actual = sha256File(absolutePath);
    } catch {
      issues.push({ file: record.file, reason: 'missing' });
      continue;
    }
    if (actual.bytes !== record.bytes) {
      issues.push({
        file: record.file,
        reason: 'size-mismatch',
        expected: String(record.bytes),
        actual: String(actual.bytes),
      });
      continue;
    }
    if (actual.sha256 !== record.sha256) {
      issues.push({ file: record.file, reason: 'hash-mismatch', expected: record.sha256, actual: actual.sha256 });
    }
  }

  return issues;
};

/** Serialises a manifest deterministically (sorted package order, trailing LF). */
export const serializeManifest = (manifest: ReleaseManifest): string => `${JSON.stringify(manifest, null, 2)}\n`;

/**
 * Renders a `checksums.sha256` file body (`<hex>  <file>` per line, sorted) for
 * the npm tarballs — the same format `sha256sum -c` consumes. The full-release
 * ZIP is intentionally NOT included here: it lives in a different directory than
 * the tarballs (and would be self-referential inside the archive), so it ships
 * its own `<zip>.sha256` sidecar instead.
 *
 * @param pathPrefix prepended to each `file` so the checksums resolve from the
 *   directory they are written into (e.g. `'npm/'` inside the release tree).
 */
export const renderChecksums = (manifest: ReleaseManifest, pathPrefix = ''): string =>
  `${[...manifest.packages]
    .map(p => ({ sha256: p.sha256, file: `${pathPrefix}${p.file}` }))
    .sort((a, b) => a.file.localeCompare(b.file))
    .map(line => `${line.sha256}  ${line.file}`)
    .join('\n')}\n`;
