/**
 * Single-package publishing, for the two cases the coordinated release cannot
 * serve: the first publish of a name the registry has never seen, and the
 * ongoing publishing of the packages that are deliberately off the engine's
 * lockstep version line.
 *
 * The coordinated release (`prepare` + `publish`) publishes with
 * `--provenance` over OIDC Trusted Publishing. A trusted publisher is
 * configured per package on npmjs.com, and a package that does not exist yet
 * has nothing to configure - so the very first publish of a new name cannot
 * use it. It runs here instead: once, with a granular token, without
 * provenance. Afterwards the name exists, its trusted publisher can be
 * registered, and every later version goes through the normal release.
 *
 * Doing this inside the coordinated release is what must not happen: that run
 * publishes every package in one ordered chain and stops at the first failure,
 * so an unconfigured new name would strand the packages behind it.
 *
 * Guarantees, all enforced here and covered by
 * `test/release/bootstrap-publish.test.ts`:
 *
 *   - Known package only: the name must come from the release registry.
 *   - Never a second time: `bootstrap` refuses a name already on the registry,
 *     `release` refuses a version already on it, each naming the path to use.
 *   - Lockstep packages stay with the coordinated release: `release` refuses
 *     them, so the engine's version line is never published piecemeal.
 *   - Build then pack then publish, in that order, from the package directory.
 *   - `--provenance` only where a trusted publisher can exist, which is never
 *     in `bootstrap`.
 *   - Dry-run by default: every npm mutation carries `--dry-run` unless the
 *     caller explicitly executes.
 *   - No false success: any failed step yields `ok === false` and stops.
 */
import type { CommandResult, CommandRunner } from './command-runner.ts';
import { INDEPENDENT_PACKAGES, LOCKSTEP_PACKAGES } from './lockstep-packages.ts';

export interface BootstrapTarget {
  /** npm package name. */
  readonly name: string;
  /** Package directory relative to the repo root. */
  readonly dir: string;
  /** Whether the version line follows the engine's. */
  readonly lockstep: boolean;
}

/** Every package a bootstrap publish may target, from both release registries. */
export const bootstrapTargets = (): readonly BootstrapTarget[] => [
  ...LOCKSTEP_PACKAGES.filter(p => p.isExtension).map(p => ({ name: p.name, dir: p.dir, lockstep: true })),
  ...INDEPENDENT_PACKAGES.map(p => ({ name: p.name, dir: p.dir, lockstep: false })),
];

export interface BootstrapOptions {
  /** Append `--dry-run` to every npm mutation. */
  dryRun: boolean;
  /** Skip the build step, for a package whose `dist/` is already current. */
  skipBuild: boolean;
  /**
   * `bootstrap` is the first publish of a name npm has never seen: it refuses
   * a name that already exists and never passes `--provenance`, because there
   * is no trusted publisher to attest against yet.
   *
   * `release` publishes a further version of a package that already exists and
   * is not on the engine's lockstep line - the independent packages, which no
   * coordinated release ever touches. It refuses a version that is already on
   * the registry, and publishes with provenance.
   */
  mode?: 'bootstrap' | 'release';
}

export type BootstrapStep = 'resolve' | 'registry-check' | 'build' | 'pack' | 'publish';

export interface BootstrapReport {
  ok: boolean;
  dryRun: boolean;
  /** The resolved target, absent when the name did not resolve. */
  target?: BootstrapTarget;
  /** The version that was published, read back from the packed tarball name. */
  version?: string;
  /** Where the run stopped, absent on success. */
  failedStep?: BootstrapStep;
  /** Why the run stopped, absent on success. */
  reason?: string;
  /** What the operator has to do next, on success. */
  followUp?: string;
}

const firstLine = (result: CommandResult): string => (result.stderr || result.stdout).trim().split('\n').slice(-1)[0] ?? '';

/**
 * The tarball `npm pack` wrote, as an absolute-or-relative path the publish
 * step can hand back to npm. `npm pack` prints the file name on its last
 * stdout line; `--json` is deliberately not used, because pnpm's npm shim
 * prefixes the output in some versions and the plain name is unambiguous.
 */
const packedTarball = (result: CommandResult): string | undefined => {
  const lines = result.stdout
    .trim()
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.endsWith('.tgz'));

  return lines.at(-1);
};

/** The version a packed tarball name carries, or `undefined` when it does not parse. */
export const versionFromTarball = (tarball: string): string | undefined => /-(\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?)\.tgz$/i.exec(tarball)?.[1];

/**
 * Whether the registry already knows this package name. Any version answering
 * counts: the point is whether a trusted publisher can be configured, which
 * needs the name to exist, not a particular version.
 */
const existsOnRegistry = (runner: CommandRunner, name: string): boolean => {
  const result = runner.run({ command: 'npm', args: ['view', name, 'name'] });

  return result.code === 0 && result.stdout.trim() === name;
};

/** Whether this exact version is already published - the resume guard of the `release` mode. */
const versionOnRegistry = (runner: CommandRunner, name: string, version: string): boolean => {
  const result = runner.run({ command: 'npm', args: ['view', `${name}@${version}`, 'version'] });

  return result.code === 0 && result.stdout.trim() === version;
};

/**
 * Runs the bootstrap publish for one package. Pure orchestration over the
 * injected runner; `repoRoot` is only used to derive the package's working
 * directory.
 */
export const bootstrapPublish = (packageName: string, options: BootstrapOptions, runner: CommandRunner, repoRoot: string): BootstrapReport => {
  const report: BootstrapReport = { ok: false, dryRun: options.dryRun };
  const target = bootstrapTargets().find(candidate => candidate.name === packageName);

  if (target === undefined) {
    report.failedStep = 'resolve';
    report.reason = `unknown package "${packageName}" - expected one of: ${bootstrapTargets()
      .map(candidate => candidate.name)
      .join(', ')}`;

    return report;
  }

  report.target = target;

  const mode = options.mode ?? 'bootstrap';
  const known = existsOnRegistry(runner, target.name);

  if (mode === 'bootstrap' && known) {
    report.failedStep = 'registry-check';
    report.reason = `${target.name} is already on the registry - a bootstrap publish is only for a name npm has never seen. Publish this version through the coordinated release instead.`;

    return report;
  }

  if (mode === 'release') {
    if (!known) {
      report.failedStep = 'registry-check';
      report.reason = `${target.name} is not on the registry yet - run the bootstrap publish first, then register its trusted publisher.`;

      return report;
    }

    if (target.lockstep) {
      report.failedStep = 'registry-check';
      report.reason = `${target.name} is on the engine's lockstep line - the coordinated release publishes it. This command is for the independent packages only.`;

      return report;
    }
  }

  const cwd = target.dir === '.' ? repoRoot : `${repoRoot}/${target.dir}`;

  if (!options.skipBuild) {
    const build = runner.run({ command: 'pnpm', args: ['--filter', target.name, 'build'], cwd: repoRoot });

    if (build.code !== 0) {
      report.failedStep = 'build';
      report.reason = firstLine(build);

      return report;
    }
  }

  const pack = runner.run({ command: 'npm', args: ['pack'], cwd });

  if (pack.code !== 0) {
    report.failedStep = 'pack';
    report.reason = firstLine(pack);

    return report;
  }

  const tarball = packedTarball(pack);

  if (tarball === undefined) {
    report.failedStep = 'pack';
    report.reason = 'npm pack printed no tarball name';

    return report;
  }

  report.version = versionFromTarball(tarball);

  if (mode === 'release' && report.version !== undefined && versionOnRegistry(runner, target.name, report.version)) {
    report.ok = true;
    report.followUp = `${target.name}@${report.version} is already published - nothing to do.`;

    return report;
  }

  // In bootstrap mode there is no trusted publisher to attest against yet, and
  // npm refuses `--provenance` without one.
  const args = ['publish', tarball, '--access', 'public'];

  if (mode === 'release') {
    args.push('--provenance');
  }

  if (options.dryRun) {
    args.push('--dry-run');
  }

  const publish = runner.run({ command: 'npm', args, cwd });

  if (publish.code !== 0) {
    report.failedStep = 'publish';
    report.reason = firstLine(publish);

    return report;
  }

  report.ok = true;
  report.followUp =
    mode === 'bootstrap'
      ? `Register the trusted publisher for ${target.name} on npmjs.com (Settings - Publishing access - GitHub Actions, workflow release.yml), so later versions publish with provenance.`
      : `${target.name}@${report.version ?? '?'} published. Its version line is its own - the coordinated release does not touch it.`;

  return report;
};
