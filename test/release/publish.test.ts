import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type CommandInvocation, type CommandResult, createRecordingRunner, fail, ok } from '../../scripts/release/command-runner';
import { PUBLISH_ORDER, type ReleaseManifest, sha256File } from '../../scripts/release/manifest';
import { defaultPublishOptions, type PublishOptions, publishRelease } from '../../scripts/release/publish';

// ── Fixture: a staging dir with four real tarball files + a coherent manifest ──
let staging: string;
let manifest: ReleaseManifest;

const resolveArtifact = (file: string): string => join(staging, file);

const tarballName = (name: string): string => `${name.replace('@', '').replace('/', '-')}-0.13.0.tgz`;

const writeFixtureTarballs = (): ReleaseManifest => {
  const packages = PUBLISH_ORDER.map((name, i) => {
    const file = tarballName(name);
    // Distinct bytes per package so a swap would change the hash.
    writeFileSync(join(staging, file), `tarball-${name}-${i}-${'x'.repeat(64 + i)}`);
    const { sha256, bytes } = sha256File(join(staging, file));
    return { name, version: '0.13.0', file, sha256, bytes };
  });
  return {
    version: '0.13.0',
    revision: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    shortRevision: 'a1b2c3d',
    tag: 'v0.13.0',
    generatedAt: new Date().toISOString(),
    publishOrder: [...PUBLISH_ORDER],
    packages,
  };
};

beforeEach(() => {
  staging = mkdtempSync(join(tmpdir(), 'exo-release-'));
  manifest = writeFixtureTarballs();
});

afterEach(() => {
  rmSync(staging, { recursive: true, force: true });
});

// Helpers to read what npm calls happened.
const publishCalls = (invocations: CommandInvocation[]): CommandInvocation[] => invocations.filter(i => i.command === 'npm' && i.args[0] === 'publish');
const distTagCalls = (invocations: CommandInvocation[]): CommandInvocation[] => invocations.filter(i => i.command === 'npm' && i.args[0] === 'dist-tag');
const publishedPackages = (invocations: CommandInvocation[]): string[] => publishCalls(invocations).map(i => i.args[1]); // tarball path
const liveOptions = (): PublishOptions => ({ ...defaultPublishOptions('0.13.0'), dryRun: false, checkExisting: true });

describe('publishRelease — dry-run', () => {
  it('publishes all six to latest in Core→Particles→Tilemap→Tiled→Physics→AudioFx order, every call carries --dry-run', () => {
    const runner = createRecordingRunner(inv => (inv.args[0] === 'view' ? fail('E404') : ok()));
    const report = publishRelease(manifest, defaultPublishOptions('0.13.0'), runner, resolveArtifact);

    expect(report.ok).toBe(true);
    expect(report.dryRun).toBe(true);

    const published = publishCalls(runner.invocations);
    expect(published).toHaveLength(6);
    // order by tarball file name reflects Core→Particles→Tilemap→Tiled→Physics→AudioFx
    expect(published.map(i => i.args[1])).toEqual([
      resolveArtifact(tarballName('@codexo/exojs')),
      resolveArtifact(tarballName('@codexo/exojs-particles')),
      resolveArtifact(tarballName('@codexo/exojs-tilemap')),
      resolveArtifact(tarballName('@codexo/exojs-tiled')),
      resolveArtifact(tarballName('@codexo/exojs-physics')),
      resolveArtifact(tarballName('@codexo/exojs-audio-fx')),
    ]);
    for (const call of published) {
      expect(call.args).toContain('--dry-run');
      expect(call.args).toContain('--tag');
      expect(call.args[call.args.indexOf('--tag') + 1]).toBe('latest');
    }
    // No dist-tag calls — we publish directly to latest.
    expect(distTagCalls(runner.invocations)).toHaveLength(0);
  });
});

describe('publishRelease — live happy path', () => {
  it('publishes all six directly to latest', () => {
    const runner = createRecordingRunner(inv => (inv.args[0] === 'view' ? fail('E404') : ok()));
    const report = publishRelease(manifest, liveOptions(), runner, resolveArtifact);

    expect(report.ok).toBe(true);
    expect(report.packages.map(p => p.publish)).toEqual(['published', 'published', 'published', 'published', 'published', 'published']);

    // No dist-tag promotion step — direct publish replaces the former staging→promote flow.
    expect(distTagCalls(runner.invocations)).toHaveLength(0);
  });
});

describe('publishRelease — idempotent resume', () => {
  it('skips versions already on the registry and still publishes the rest', () => {
    // Core already present; particles + tilemap + tiled not.
    const runner = createRecordingRunner(inv => {
      if (inv.args[0] === 'view') {
        return inv.args[1].startsWith('@codexo/exojs@') ? ok('0.13.0') : fail('E404');
      }
      return ok();
    });
    const report = publishRelease(manifest, liveOptions(), runner, resolveArtifact);

    expect(report.ok).toBe(true);
    expect(report.packages[0].publish).toBe('already-published');
    expect(report.packages[1].publish).toBe('published');
    expect(report.packages[2].publish).toBe('published');
    expect(report.packages[3].publish).toBe('published');
    expect(report.packages[4].publish).toBe('published');
    expect(report.packages[5].publish).toBe('published');
    // Core was NOT re-published.
    expect(publishedPackages(runner.invocations)).toEqual([
      resolveArtifact(tarballName('@codexo/exojs-particles')),
      resolveArtifact(tarballName('@codexo/exojs-tilemap')),
      resolveArtifact(tarballName('@codexo/exojs-tiled')),
      resolveArtifact(tarballName('@codexo/exojs-physics')),
      resolveArtifact(tarballName('@codexo/exojs-audio-fx')),
    ]);
  });

  it('a fully-published release re-run publishes nothing', () => {
    const runner = createRecordingRunner(inv => (inv.args[0] === 'view' ? ok('0.13.0') : ok()));
    const report = publishRelease(manifest, liveOptions(), runner, resolveArtifact);

    expect(report.ok).toBe(true);
    expect(publishCalls(runner.invocations)).toHaveLength(0);
    expect(report.packages.every(p => p.publish === 'already-published')).toBe(true);
  });
});

describe('publishRelease — partial failure stops the chain', () => {
  const failOn = (failedPkg: string) =>
    createRecordingRunner((inv): CommandResult => {
      if (inv.args[0] === 'view') return fail('E404');
      if (inv.args[0] === 'publish' && inv.args[1].includes(tarballName(failedPkg).replace('.tgz', ''))) {
        return fail('npm publish 403');
      }
      return ok();
    });

  it('Core fails → Particles/Tilemap/Tiled never attempted, ok=false', () => {
    const runner = failOn('@codexo/exojs');
    const report = publishRelease(manifest, liveOptions(), runner, resolveArtifact);

    expect(report.ok).toBe(false);
    expect(report.packages[0].publish).toBe('failed');
    expect(report.packages[1].publish).toBe('not-attempted');
    expect(report.packages[2].publish).toBe('not-attempted');
    expect(report.packages[3].publish).toBe('not-attempted');
    expect(distTagCalls(runner.invocations)).toHaveLength(0);
    // Only the Core publish was attempted.
    expect(publishCalls(runner.invocations)).toHaveLength(1);
  });

  it('Particles fails → Core published, Tilemap/Tiled never attempted, ok=false', () => {
    const runner = failOn('@codexo/exojs-particles');
    const report = publishRelease(manifest, liveOptions(), runner, resolveArtifact);

    expect(report.ok).toBe(false);
    expect(report.packages[0].publish).toBe('published');
    expect(report.packages[1].publish).toBe('failed');
    expect(report.packages[2].publish).toBe('not-attempted');
    expect(report.packages[3].publish).toBe('not-attempted');
    expect(distTagCalls(runner.invocations)).toHaveLength(0);
  });

  it('Tiled fails → Core+Particles+Tilemap published but chain stops, ok=false', () => {
    const runner = failOn('@codexo/exojs-tiled');
    const report = publishRelease(manifest, liveOptions(), runner, resolveArtifact);

    expect(report.ok).toBe(false);
    expect(report.packages.map(p => p.publish)).toEqual(['published', 'published', 'published', 'failed', 'not-attempted', 'not-attempted']);
    expect(distTagCalls(runner.invocations)).toHaveLength(0);
  });
});

describe('publishRelease — build-once guarantee', () => {
  it('aborts before any npm call when a tarball drifted since prepare', () => {
    // Rewrite Core's tarball with same-length-but-different bytes after the
    // manifest was built — exercises content hashing, not just size.
    const original = readFileSync(join(staging, manifest.packages[0].file));
    const mutated = Buffer.from(original);
    mutated[0] = mutated[0] ^ 0xff;
    writeFileSync(join(staging, manifest.packages[0].file), mutated);

    const runner = createRecordingRunner(() => ok());
    const report = publishRelease(manifest, liveOptions(), runner, resolveArtifact);

    expect(report.ok).toBe(false);
    expect(report.abortReason).toMatch(/artifact drift/);
    expect(report.abortReason).toContain('hash-mismatch');
    // Crucially: nothing was published — not a single npm invocation.
    expect(runner.invocations).toHaveLength(0);
  });

  it('aborts when a tarball is missing entirely', () => {
    rmSync(join(staging, manifest.packages[1].file));
    const runner = createRecordingRunner(() => ok());
    const report = publishRelease(manifest, liveOptions(), runner, resolveArtifact);

    expect(report.ok).toBe(false);
    expect(report.abortReason).toContain('missing');
    expect(runner.invocations).toHaveLength(0);
  });
});

describe('publishRelease — no false success', () => {
  it('skips npm view entirely when checkExisting is false', () => {
    const runner = createRecordingRunner(() => ok());
    const report = publishRelease(manifest, { ...liveOptions(), checkExisting: false }, runner, resolveArtifact);
    expect(report.ok).toBe(true);
    expect(runner.invocations.filter(i => i.args[0] === 'view')).toHaveLength(0);
  });
});
