/**
 * Publish stage of the coordinated release.
 *
 * Consumes ONLY the artifacts recorded by `prepare` (it never builds or packs).
 * Guarantees, all enforced here and covered by `test/release/publish.test.ts`:
 *
 *   - Build-once: re-hashes every tarball and aborts on drift from the manifest.
 *   - Order: Core first, then the extensions, per PUBLISH_ORDER.
 *   - Direct latest: packages are published straight to `latest` (no staging tag).
 *     OIDC Trusted Publishing only mints tokens for `npm publish`, so the former
 *     two-phase staging→promote approach failed with E401 on `npm dist-tag add`.
 *   - Idempotent resume: a version already on the registry is skipped, not
 *     re-published; a re-run completes a partially-finished release.
 *   - No false success: any failed step yields `ok === false`.
 *   - Dry-run: every npm mutation carries `--dry-run`.
 */
import { PUBLISH_ORDER, type ReleaseManifest, type TarballRecord, verifyManifestArtifacts } from './manifest.ts';
import type { CommandResult, CommandRunner } from './command-runner.ts';

export interface PublishOptions {
  /** Append `--dry-run` to every npm mutation. */
  dryRun: boolean;
  /** dist-tag passed to `npm publish --tag`. Defaults to `latest`. */
  distTag: string;
  /** When true, query `npm view` to skip versions already on the registry. */
  checkExisting: boolean;
  /** Pass `--provenance` to `npm publish` (OIDC trusted publishing). */
  provenance: boolean;
}

export const defaultPublishOptions = (_version: string): PublishOptions => ({
  dryRun: true,
  distTag: 'latest',
  checkExisting: true,
  provenance: false,
});

export type PublishState = 'published' | 'already-published' | 'failed' | 'not-attempted';

export interface PackageOutcome {
  name: string;
  version: string;
  publish: PublishState;
  detail?: string;
}

export interface PublishReport {
  ok: boolean;
  dryRun: boolean;
  version: string;
  distTag: string;
  /** Set when the run aborted before touching the registry. */
  abortReason?: string;
  packages: PackageOutcome[];
}

const orderedPackages = (manifest: ReleaseManifest): TarballRecord[] =>
  [...manifest.packages].sort((a, b) => PUBLISH_ORDER.indexOf(a.name) - PUBLISH_ORDER.indexOf(b.name));

const isAlreadyPublished = (runner: CommandRunner, pkg: TarballRecord): boolean => {
  const result: CommandResult = runner.run({ command: 'npm', args: ['view', `${pkg.name}@${pkg.version}`, 'version'] });
  // `npm view` prints the version on stdout when it exists, errors otherwise.
  return result.code === 0 && result.stdout.trim() === pkg.version;
};

const publishTarball = (runner: CommandRunner, pkg: TarballRecord, absoluteTarball: string, options: PublishOptions): CommandResult => {
  const args = ['publish', absoluteTarball, '--tag', options.distTag, '--access', 'public'];
  if (options.provenance) args.push('--provenance');
  if (options.dryRun) args.push('--dry-run');
  return runner.run({ command: 'npm', args });
};

/**
 * Runs the publish stage. Pure orchestration over the injected runner and a
 * resolver that maps a manifest-relative tarball path to its absolute location.
 */
export const publishRelease = (
  manifest: ReleaseManifest,
  options: PublishOptions,
  runner: CommandRunner,
  resolveArtifact: (relativeFile: string) => string,
): PublishReport => {
  const packages = orderedPackages(manifest);
  const outcomes: PackageOutcome[] = packages.map(pkg => ({
    name: pkg.name,
    version: pkg.version,
    publish: 'not-attempted',
  }));

  const report: PublishReport = {
    ok: false,
    dryRun: options.dryRun,
    version: manifest.version,
    distTag: options.distTag,
    packages: outcomes,
  };

  // ── Build-once guard ────────────────────────────────────────────────────
  // Re-hash the on-disk artifacts. Any drift means something rebuilt or
  // mutated the tarballs after `prepare` — refuse to publish.
  const drift = verifyManifestArtifacts(manifest, resolveArtifact);
  if (drift.length > 0) {
    report.abortReason = `artifact drift since prepare: ${drift.map(issue => `${issue.file} (${issue.reason})`).join(', ')}`;
    return report;
  }

  // ── Publish each package directly to the target dist-tag, in order ─────────
  // We publish straight to `latest` (the default distTag). The former two-phase
  // staging→promote approach is gone: OIDC only mints tokens for `npm publish`,
  // not for `npm dist-tag add`, so promotion failed with E401 under Trusted
  // Publishing. Direct publish is idempotent-resume-safe: a failed mid-run can
  // be restarted and `checkExisting` will skip already-published versions.
  for (let i = 0; i < packages.length; i++) {
    const pkg = packages[i];
    const outcome = outcomes[i];

    if (options.checkExisting && isAlreadyPublished(runner, pkg)) {
      outcome.publish = 'already-published';
      continue;
    }

    const result = publishTarball(runner, pkg, resolveArtifact(pkg.file), options);
    if (result.code !== 0) {
      outcome.publish = 'failed';
      outcome.detail = (result.stderr || result.stdout).trim().split('\n').slice(-1)[0];
      // Stop the chain immediately — later packages are never attempted.
      return report;
    }
    outcome.publish = 'published';
  }

  report.ok = true;
  return report;
};
