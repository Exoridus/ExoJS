import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const repoRoot = resolve(__dirname, '..', '..');
const changelogPath = resolve(repoRoot, 'CHANGELOG.md');

const readChangelog = (): string => readFileSync(changelogPath, 'utf8');

/** Extract the 0.14.0 section text (from its heading to the next `## [` heading). */
const extractV014Section = (): string => {
  const content = readChangelog();
  const startMarker = '## [0.14.0]';
  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) throw new Error('0.14.0 section not found in CHANGELOG.md');
  const afterStart = content.indexOf('\n', startIndex);
  const nextSection = content.indexOf('\n## [', afterStart + 1);
  return content.slice(afterStart + 1, nextSection === -1 ? undefined : nextSection);
};

/** Load a lockstep extension package.json by its @codexo/ name. */
const loadPackageJson = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(repoRoot, 'packages', name.replace('@codexo/', ''), 'package.json'), 'utf8'));

// Matchers use single tokens (not multi-word phrases) because Prettier
// prose-wraps the changelog, so an inter-word match could span a newline.
describe('v0.14 release text invariants', () => {
  const section = extractV014Section();

  it('carries a concrete release date in the heading', () => {
    // `release:notes` (publish job, AFTER npm publish) hard-fails on any
    // heading that is not `## [0.14.0] - YYYY-MM-DD` — "Unreleased" would
    // publish npm packages and then abort the GitHub release.
    expect(readChangelog()).toMatch(/^## \[0\.14\.0\] - \d{4}-\d{2}-\d{2}$/m);
  });

  it('contains no #this placeholder', () => {
    expect(section).not.toMatch(/#this/);
  });

  it('introduces the two new lockstep packages', () => {
    expect(section).toMatch(/@codexo\/exojs-physics/);
    expect(section).toMatch(/@codexo\/exojs-audio-fx/);
  });

  it('documents the breaking scene-stack removal', () => {
    expect(section).toMatch(/SceneStackMode/);
  });

  it('documents the major additive features', () => {
    expect(section).toMatch(/\bUI\b/);
    expect(section).toMatch(/serializ/i);
    expect(section).toMatch(/immediate-mode/i);
  });
});

describe('package manifest / changelog version coherence', () => {
  const packages = ['@codexo/exojs-particles', '@codexo/exojs-tilemap', '@codexo/exojs-tiled', '@codexo/exojs-physics', '@codexo/exojs-audio-fx'];

  for (const pkg of packages) {
    it(`${pkg} manifest version is 0.14.0`, () => {
      const manifest = loadPackageJson(pkg);
      expect(manifest.version).toBe('0.14.0');
    });

    it(`${pkg} peer dependency range is 0.14.x`, () => {
      const manifest = loadPackageJson(pkg);
      const peers = (manifest.peerDependencies ?? {}) as Record<string, string>;
      expect(peers['@codexo/exojs']).toBe('0.14.x');
    });
  }

  it('@codexo/exojs-tiled has @codexo/exojs-tilemap as a regular dependency', () => {
    const manifest = loadPackageJson('@codexo/exojs-tiled');
    const deps = (manifest.dependencies ?? {}) as Record<string, string>;
    expect(deps['@codexo/exojs-tilemap']).toBeDefined();
  });

  it('root package version is 0.14.0', () => {
    const root = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
    expect(root.version).toBe('0.14.0');
  });
});
