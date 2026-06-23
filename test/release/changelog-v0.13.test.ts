import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const repoRoot = resolve(__dirname, '..', '..');
const changelogPath = resolve(repoRoot, 'CHANGELOG.md');

const readChangelog = (): string => readFileSync(changelogPath, 'utf8');

/** Extract the 0.13.0 section text (from its heading to the next `## [` heading). */
const extractV013Section = (): string => {
  const content = readChangelog();
  const startMarker = '## [0.13.0]';
  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) throw new Error('0.13.0 section not found in CHANGELOG.md');
  const afterStart = content.indexOf('\n', startIndex);
  const nextSection = content.indexOf('\n## [', afterStart + 1);
  return content.slice(afterStart + 1, nextSection === -1 ? undefined : nextSection);
};

// Historical invariants for the shipped 0.13.0 section. Live package-version
// coherence is asserted by the CURRENT release's test (changelog-v0.14.test.ts),
// not here — that check moves forward with each release.
describe('v0.13 release text invariants', () => {
  const section = extractV013Section();

  it('carries a concrete release date in the heading', () => {
    // `release:notes` (publish job, AFTER npm publish) hard-fails on any
    // heading that is not `## [0.13.0] - YYYY-MM-DD` — "Unreleased" would
    // publish npm packages and then abort the GitHub release.
    expect(readChangelog()).toMatch(/^## \[0\.13\.0\] - \d{4}-\d{2}-\d{2}$/m);
  });

  it('contains no #this placeholder', () => {
    expect(section).not.toMatch(/#this/);
  });

  it('contains no stale Loader.loadEx reference', () => {
    expect(section).not.toMatch(/\bloadEx\b/);
  });

  it('contains no stale Extension.descriptor reference', () => {
    expect(section).not.toMatch(/Extension\.descriptor/);
  });

  it('correctly documents TileLayer chunk default as 32', () => {
    expect(section).toMatch(/32/);
    expect(section).not.toMatch(/16×16/);
  });

  it('correctly names AssetHandler.getIdentityKey', () => {
    expect(section).toMatch(/getIdentityKey/);
  });

  it('contains the published lockstep versions', () => {
    expect(section).toMatch(/@codexo\/exojs\s+0\.13\.0/);
    expect(section).toMatch(/@codexo\/exojs-particles\s+0\.13\.0/);
    expect(section).toMatch(/@codexo\/exojs-tilemap\s+0\.13\.0/);
    expect(section).toMatch(/@codexo\/exojs-tiled\s+0\.13\.0/);
  });

  it('contains the correct peer dependency ranges', () => {
    expect(section).toMatch(/0\.13\.x/);
  });

  it('contains the Tiled → Tilemap dependency', () => {
    expect(section).toMatch(/@codexo\/exojs-tilemap\s+0\.13\.0/);
  });

  it('does not claim particles was newly extracted in v0.13', () => {
    // The v0.12 section already documents this; the v0.13 section should not
    // claim Core stopped shipping particles in this version.
    expect(section).not.toMatch(/Core no longer ships the particles/);
    expect(section).not.toMatch(/Core no longer includes any Tiled/);
  });

  it('does not describe TiledMap as raw parsed source', () => {
    expect(section).toMatch(/structured/);
  });
});
