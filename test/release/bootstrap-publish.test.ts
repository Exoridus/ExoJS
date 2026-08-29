import { describe, expect, it } from 'vitest';

import { bootstrapPublish, bootstrapTargets, versionFromTarball } from '../../scripts/release/bootstrap-publish';
import { type CommandInvocation, type CommandResult, createRecordingRunner, fail, ok } from '../../scripts/release/command-runner';

const repoRoot = '/repo';

/**
 * Default registry answer: `npm view <name> name` fails, which is what npm
 * does for a name it has never seen (E404). Every other call succeeds; `npm
 * pack` prints the tarball it wrote.
 */
const respondNewPackage =
  (packed = 'create-exo-app-0.1.0.tgz') =>
  (invocation: CommandInvocation): CommandResult => {
    if (invocation.command === 'npm' && invocation.args[0] === 'view') return fail('E404 Not found');
    if (invocation.command === 'npm' && invocation.args[0] === 'pack') return ok(`npm notice\n${packed}\n`);

    return ok();
  };

const npmCalls = (invocations: CommandInvocation[], verb: string): CommandInvocation[] =>
  invocations.filter(invocation => invocation.command === 'npm' && invocation.args[0] === verb);

describe('bootstrapTargets', () => {
  it('offers every extension and every independent package, and never Core', () => {
    const names = bootstrapTargets().map(target => target.name);

    expect(names).toContain('create-exo-app');
    expect(names).toContain('@codexo/exojs-tilemap-physics');
    expect(names).toContain('@codexo/exojs-build');
    expect(names).not.toContain('@codexo/exojs');
  });

  it('marks the lockstep line so a caller can tell the two version lines apart', () => {
    const targets = bootstrapTargets();

    expect(targets.find(t => t.name === '@codexo/exojs-tilemap-physics')?.lockstep).toBe(true);
    expect(targets.find(t => t.name === 'create-exo-app')?.lockstep).toBe(false);
  });
});

describe('versionFromTarball', () => {
  it('reads the version out of the packed file name, scoped or not, prerelease or not', () => {
    expect(versionFromTarball('create-exo-app-0.1.0.tgz')).toBe('0.1.0');
    expect(versionFromTarball('codexo-exojs-tilemap-physics-0.15.3.tgz')).toBe('0.15.3');
    expect(versionFromTarball('codexo-exojs-tilemap-physics-0.16.0-rc.1.tgz')).toBe('0.16.0-rc.1');
    expect(versionFromTarball('not-a-tarball.txt')).toBeUndefined();
  });
});

describe('bootstrapPublish', () => {
  it('builds, packs and publishes, in that order, and reports the version', () => {
    const runner = createRecordingRunner(respondNewPackage());
    const report = bootstrapPublish('create-exo-app', { dryRun: true, skipBuild: false }, runner, repoRoot);

    expect(report.ok).toBe(true);
    expect(report.version).toBe('0.1.0');
    expect(runner.invocations.map(i => `${i.command} ${i.args[0]}`)).toEqual(['npm view', 'pnpm --filter', 'npm pack', 'npm publish']);
  });

  it('never passes --provenance, because the name has no trusted publisher yet', () => {
    const runner = createRecordingRunner(respondNewPackage());

    bootstrapPublish('create-exo-app', { dryRun: false, skipBuild: false }, runner, repoRoot);

    expect(npmCalls(runner.invocations, 'publish')[0]?.args).not.toContain('--provenance');
    expect(npmCalls(runner.invocations, 'publish')[0]?.args).toContain('--access');
  });

  it('carries --dry-run by default and drops it only when the caller executes', () => {
    const dry = createRecordingRunner(respondNewPackage());
    const live = createRecordingRunner(respondNewPackage());

    bootstrapPublish('create-exo-app', { dryRun: true, skipBuild: false }, dry, repoRoot);
    bootstrapPublish('create-exo-app', { dryRun: false, skipBuild: false }, live, repoRoot);

    expect(npmCalls(dry.invocations, 'publish')[0]?.args).toContain('--dry-run');
    expect(npmCalls(live.invocations, 'publish')[0]?.args).not.toContain('--dry-run');
  });

  it('refuses a name that is already on the registry and names the path to use instead', () => {
    const runner = createRecordingRunner(invocation => (invocation.args[0] === 'view' ? ok('@codexo/exojs-tilemap-physics\n') : ok()));
    const report = bootstrapPublish('@codexo/exojs-tilemap-physics', { dryRun: true, skipBuild: false }, runner, repoRoot);

    expect(report.ok).toBe(false);
    expect(report.failedStep).toBe('registry-check');
    expect(report.reason).toMatch(/coordinated release/);
    expect(npmCalls(runner.invocations, 'publish')).toHaveLength(0);
  });

  it('refuses a package that is in neither release registry', () => {
    const runner = createRecordingRunner(respondNewPackage());
    const report = bootstrapPublish('@codexo/exojs-not-a-package', { dryRun: true, skipBuild: false }, runner, repoRoot);

    expect(report.ok).toBe(false);
    expect(report.failedStep).toBe('resolve');
    expect(runner.invocations).toHaveLength(0);
  });

  it('stops at the failing step and publishes nothing', () => {
    const buildFails = createRecordingRunner(invocation => {
      if (invocation.command === 'npm' && invocation.args[0] === 'view') return fail('E404');
      if (invocation.command === 'pnpm') return fail('tsc exited 2');

      return ok();
    });
    const report = bootstrapPublish('create-exo-app', { dryRun: true, skipBuild: false }, buildFails, repoRoot);

    expect(report.ok).toBe(false);
    expect(report.failedStep).toBe('build');
    expect(report.reason).toBe('tsc exited 2');
    expect(npmCalls(buildFails.invocations, 'pack')).toHaveLength(0);
  });

  it('reports a pack that produced no tarball rather than publishing something unnamed', () => {
    const runner = createRecordingRunner(invocation => {
      if (invocation.command === 'npm' && invocation.args[0] === 'view') return fail('E404');
      if (invocation.command === 'npm' && invocation.args[0] === 'pack') return ok('npm notice nothing here\n');

      return ok();
    });
    const report = bootstrapPublish('create-exo-app', { dryRun: true, skipBuild: false }, runner, repoRoot);

    expect(report.ok).toBe(false);
    expect(report.failedStep).toBe('pack');
    expect(npmCalls(runner.invocations, 'publish')).toHaveLength(0);
  });

  it('skips the build when asked, for a dist that is already current', () => {
    const runner = createRecordingRunner(respondNewPackage());

    bootstrapPublish('create-exo-app', { dryRun: true, skipBuild: true }, runner, repoRoot);

    expect(runner.invocations.filter(i => i.command === 'pnpm')).toHaveLength(0);
  });

  it('packs and publishes from the package directory, not the repo root', () => {
    const runner = createRecordingRunner(respondNewPackage());

    bootstrapPublish('create-exo-app', { dryRun: true, skipBuild: false }, runner, repoRoot);

    expect(npmCalls(runner.invocations, 'pack')[0]?.cwd).toBe('/repo/packages/create-exo-app');
    expect(npmCalls(runner.invocations, 'publish')[0]?.cwd).toBe('/repo/packages/create-exo-app');
  });

  it('tells the operator to register the trusted publisher afterwards', () => {
    const runner = createRecordingRunner(respondNewPackage());
    const report = bootstrapPublish('create-exo-app', { dryRun: false, skipBuild: false }, runner, repoRoot);

    expect(report.followUp).toMatch(/trusted publisher/i);
  });
});

describe('bootstrapPublish - release mode, for the packages off the lockstep line', () => {
  const respondKnownPackage =
    (published: string[] = []) =>
    (invocation: CommandInvocation): CommandResult => {
      if (invocation.command === 'npm' && invocation.args[0] === 'view') {
        const query = invocation.args[1] ?? '';

        if (!query.includes('@', 1)) return ok('create-exo-app\n');

        const version = query.split('@').at(-1) ?? '';

        return published.includes(version) ? ok(`${version}\n`) : fail('E404');
      }

      if (invocation.command === 'npm' && invocation.args[0] === 'pack') return ok('create-exo-app-0.1.0.tgz\n');

      return ok();
    };

  it('publishes a new version with provenance, once a trusted publisher can exist', () => {
    const runner = createRecordingRunner(respondKnownPackage());
    const report = bootstrapPublish('create-exo-app', { dryRun: false, skipBuild: false, mode: 'release' }, runner, repoRoot);

    expect(report.ok).toBe(true);
    expect(npmCalls(runner.invocations, 'publish')[0]?.args).toContain('--provenance');
  });

  it('is a no-op for a version that is already on the registry', () => {
    const runner = createRecordingRunner(respondKnownPackage(['0.1.0']));
    const report = bootstrapPublish('create-exo-app', { dryRun: false, skipBuild: false, mode: 'release' }, runner, repoRoot);

    expect(report.ok).toBe(true);
    expect(report.followUp).toMatch(/already published/);
    expect(npmCalls(runner.invocations, 'publish')).toHaveLength(0);
  });

  it('refuses a lockstep package, which the coordinated release owns', () => {
    const runner = createRecordingRunner(invocation => (invocation.args[0] === 'view' ? ok('@codexo/exojs-tilemap-physics\n') : ok()));
    const report = bootstrapPublish('@codexo/exojs-tilemap-physics', { dryRun: true, skipBuild: false, mode: 'release' }, runner, repoRoot);

    expect(report.ok).toBe(false);
    expect(report.reason).toMatch(/coordinated release publishes it/);
  });

  it('refuses a name that does not exist yet and points at the bootstrap', () => {
    const runner = createRecordingRunner(respondNewPackage());
    const report = bootstrapPublish('create-exo-app', { dryRun: true, skipBuild: false, mode: 'release' }, runner, repoRoot);

    expect(report.ok).toBe(false);
    expect(report.reason).toMatch(/bootstrap publish first/);
  });
});
