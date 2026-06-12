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
    name: pkg,
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
    it('publishes all four to the temp dist-tag in Core→Particles→Tilemap→Tiled order, every call carries --dry-run', () => {
    const runner = createRecordingRunner(inv => (inv.args[0] === 'view' ? fail('E404') : ok()));
    const report = publishRelease(manifest, defaultPublishOptions('0.13.0'), runner, resolveArtifact);

    expect(report.ok).toBe(true);
    expect(report.dryRun).toBe(true);

    const published = publishCalls(runner.invocations);
    expect(published).toHaveLength(4);
    // order by tarball file name reflects Core→Particles→Tilemap→Tiled
    expect(published.map(i => i.args[1])).toEqual([
      resolveArtifact(tarballName('@codexo/exojs')),
      resolveArtifact(tarballName('@codexo/exojs-particles')),
      resolveArtifact(tarballName('@codexo/exojs-tilemap')),
      resolveArtifact(tarballName('@codexo/exojs-tiled')),
    ]);
    for (const call of published) {
      expect(call.args).toContain('--dry-run');
      expect(call.args).toContain('--tag');
      expect(call.args[call.args.indexOf('--tag') + 1]).toBe('staging-0.13.0');
    }
    // Promotion happens but as dry-run (no real latest move).
    expect(report.packages.every(p => p.promote === 'skipped-dry-run')).toBe(true);
  });
});

describe('publishRelease — live happy path', () => {
    it('publishes then promotes all four to latest', () => {
    const runner = createRecordingRunner(inv => (inv.args[0] === 'view' ? fail('E404') : ok()));
    const report = publishRelease(manifest, liveOptions(), runner, resolveArtifact);

    expect(report.ok).toBe(true);
    expect(report.packages.map(p => p.publish)).toEqual(['published', 'published', 'published', 'published']);
    expect(report.packages.map(p => p.promote)).toEqual(['promoted', 'promoted', 'promoted', 'promoted']);

    // dist-tag promotion runs once per package, AFTER all publishes, to `latest`.
    const tags = distTagCalls(runner.invocations);
    expect(tags).toHaveLength(4);
    expect(tags.map(t => t.args[3])).toEqual(['latest', 'latest', 'latest', 'latest']);
    const firstTagIndex = runner.invocations.findIndex(i => i.args[0] === 'dist-tag');
    const lastPublishIndex = runner.invocations.map(i => i.args[0]).lastIndexOf('publish');
    expect(firstTagIndex).toBeGreaterThan(lastPublishIndex);
  });
});

describe('publishRelease — idempotent resume', () => {
  it('skips versions already on the registry and still publishes the rest, then promotes', () => {
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
    // Core was NOT re-published…
    expect(publishedPackages(runner.invocations)).toEqual([
      resolveArtifact(tarballName('@codexo/exojs-particles')),
      resolveArtifact(tarballName('@codexo/exojs-tilemap')),
      resolveArtifact(tarballName('@codexo/exojs-tiled')),
    ]);
    // …but it still gets promoted to latest along with the others.
    expect(report.packages.map(p => p.promote)).toEqual(['promoted', 'promoted', 'promoted', 'promoted']);
  });

  it('a fully-published release re-run promotes everything and publishes nothing', () => {
    const runner = createRecordingRunner(inv => (inv.args[0] === 'view' ? ok('0.13.0') : ok()));
    const report = publishRelease(manifest, liveOptions(), runner, resolveArtifact);

    expect(report.ok).toBe(true);
    expect(publishCalls(runner.invocations)).toHaveLength(0);
    expect(report.packages.every(p => p.publish === 'already-published')).toBe(true);
    expect(report.packages.every(p => p.promote === 'promoted')).toBe(true);
  });
});

describe('publishRelease — partial failure never promotes latest', () => {
  const failOn = (failedPkg: string) =>
    createRecordingRunner((inv): CommandResult => {
      if (inv.args[0] === 'view') return fail('E404');
      if (inv.args[0] === 'publish' && inv.args[1].includes(tarballName(failedPkg).replace('.tgz', ''))) {
        return fail('npm publish 403');
      }
      return ok();
    });

  it('Core fails → Particles/Tilemap/Tiled never attempted, no promotion, ok=false', () => {
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

  it('Particles fails → Core published but NOT promoted, Tilemap/Tiled never attempted, ok=false', () => {
    const runner = failOn('@codexo/exojs-particles');
    const report = publishRelease(manifest, liveOptions(), runner, resolveArtifact);

    expect(report.ok).toBe(false);
    expect(report.packages[0].publish).toBe('published');
    expect(report.packages[1].publish).toBe('failed');
    expect(report.packages[2].publish).toBe('not-attempted');
    expect(report.packages[3].publish).toBe('not-attempted');
    // The crux: a partial failure promotes nothing to latest — not even Core.
    expect(distTagCalls(runner.invocations)).toHaveLength(0);
    expect(report.packages.every(p => p.promote === 'not-attempted')).toBe(true);
  });

  it('Tiled fails → Core+Particles+Tilemap published but no promotion, ok=false', () => {
    const runner = failOn('@codexo/exojs-tiled');
    const report = publishRelease(manifest, liveOptions(), runner, resolveArtifact);

    expect(report.ok).toBe(false);
    expect(report.packages.map(p => p.publish)).toEqual(['published', 'published', 'published', 'failed']);
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
  it('reports ok=false if the final latest promotion fails after publishing', () => {
    const runner = createRecordingRunner(inv => {
      if (inv.args[0] === 'view') return fail('E404');
      if (inv.args[0] === 'dist-tag') return fail('promotion blew up');
      return ok();
    });
    const report = publishRelease(manifest, liveOptions(), runner, resolveArtifact);

    expect(report.ok).toBe(false);
    // All four published, but promotion failed on the first → ok stays false.
    expect(report.packages.every(p => p.publish === 'published')).toBe(true);
    expect(report.packages.some(p => p.promote === 'failed')).toBe(true);
  });

  it('skips npm view entirely when checkExisting is false', () => {
    const runner = createRecordingRunner(() => ok());
    const report = publishRelease(manifest, { ...liveOptions(), checkExisting: false }, runner, resolveArtifact);
    expect(report.ok).toBe(true);
    expect(runner.invocations.filter(i => i.args[0] === 'view')).toHaveLength(0);
  });
});
