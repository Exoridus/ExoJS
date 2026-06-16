import { describe, expect, it } from 'vitest';

import { effectiveLanes, selectAreas } from '../../scripts/ci/select-lanes.mjs';

// Deterministic coverage for the CI path-to-lane policy. The logic under test is
// scripts/ci/select-lanes.mjs — the SAME module the "Detect changes" job in
// .github/workflows/_ci-checks.yml runs — so these assertions exercise the real
// lane-selection decision, not a copy of it.

/** Areas + concrete lanes for a set of changed files. */
const decide = (...files: readonly string[]) => {
  const areas = selectAreas(files);
  return { areas, lanes: effectiveLanes(areas) };
};

describe('CI lane selection — engine/site areas', () => {
  it('tilemap SOURCE change runs every engine lane (unit, coverage, package-verify, all browsers) and site', () => {
    const { areas, lanes } = decide('packages/exojs-tilemap/src/TileMap.ts');
    expect(areas).toEqual({ engine: true, site: true });
    expect(lanes.unit).toBe(true);
    expect(lanes.coverage).toBe(true);
    expect(lanes.packageVerify).toBe(true);
    expect(lanes.browserWebgl2).toBe(true);
    expect(lanes.browserWebgpu).toBe(true);
    expect(lanes.browserFirefox).toBe(true);
    expect(lanes.typecheck).toBe(true);
    expect(lanes.lint).toBe(true);
    expect(lanes.siteBuild).toBe(true);
  });

  it('tilemap TEST-only change still runs unit + engine lanes', () => {
    const { areas, lanes } = decide('packages/exojs-tilemap/test/view.test.ts');
    expect(areas.engine).toBe(true);
    expect(lanes.unit).toBe(true);
    expect(lanes.coverage).toBe(true);
    expect(lanes.packageVerify).toBe(true);
    expect(lanes.browserWebgl2).toBe(true);
  });

  it('tiled SOURCE change runs engine + package validation + browser lanes', () => {
    const { areas, lanes } = decide('packages/exojs-tiled/src/TiledMap.ts');
    expect(areas).toEqual({ engine: true, site: true });
    expect(lanes.unit).toBe(true);
    expect(lanes.packageVerify).toBe(true);
    expect(lanes.browserWebgl2).toBe(true);
    expect(lanes.browserWebgpu).toBe(true);
    expect(lanes.browserFirefox).toBe(true);
  });

  it('physics SOURCE change runs every engine lane and site', () => {
    const { areas, lanes } = decide('packages/exojs-physics/src/PhysicsWorld.ts');
    expect(areas).toEqual({ engine: true, site: true });
    expect(lanes.unit).toBe(true);
    expect(lanes.coverage).toBe(true);
    expect(lanes.packageVerify).toBe(true);
    expect(lanes.browserWebgl2).toBe(true);
    expect(lanes.browserWebgpu).toBe(true);
    expect(lanes.browserFirefox).toBe(true);
  });

  it('tiled FIXTURE change runs unit + package validation', () => {
    const { areas, lanes } = decide('packages/exojs-tiled/test/fixtures/orthogonal-rich.tmj');
    expect(areas.engine).toBe(true);
    expect(lanes.unit).toBe(true);
    expect(lanes.packageVerify).toBe(true);
  });

  it('package README-only change is docs/site, NOT engine (no unit/coverage/package-verify/browser)', () => {
    const { areas, lanes } = decide('packages/exojs-tilemap/README.md');
    expect(areas).toEqual({ engine: false, site: true });
    expect(lanes.unit).toBe(false);
    expect(lanes.coverage).toBe(false);
    expect(lanes.packageVerify).toBe(false);
    expect(lanes.browserWebgl2).toBe(false);
    expect(lanes.browserWebgpu).toBe(false);
    expect(lanes.browserFirefox).toBe(false);
    expect(lanes.siteBuild).toBe(true);
    // typecheck + lint are ungated, so they still run on every PR.
    expect(lanes.typecheck).toBe(true);
    expect(lanes.lint).toBe(true);
  });

  it('package LICENSE / CHANGELOG changes are docs/site, NOT engine', () => {
    expect(selectAreas(['packages/exojs-tiled/LICENSE'])).toEqual({ engine: false, site: true });
    expect(selectAreas(['packages/exojs-particles/CHANGELOG.md'])).toEqual({ engine: false, site: true });
  });

  it('core engine SOURCE change keeps existing behavior (engine lanes, no site)', () => {
    const { areas, lanes } = decide('src/rendering/Drawable.ts');
    expect(areas).toEqual({ engine: true, site: false });
    expect(lanes.unit).toBe(true);
    expect(lanes.browserWebgl2).toBe(true);
    expect(lanes.packageVerify).toBe(true);
    expect(lanes.siteBuild).toBe(false);
  });

  it('site-only change runs site build but NOT engine/browser/package lanes', () => {
    const { areas, lanes } = decide('site/src/pages/index.astro');
    expect(areas).toEqual({ engine: false, site: true });
    expect(lanes.unit).toBe(false);
    expect(lanes.browserWebgl2).toBe(false);
    expect(lanes.browserWebgpu).toBe(false);
    expect(lanes.packageVerify).toBe(false);
    expect(lanes.siteBuild).toBe(true);
  });

  it('workflow change triggers broad validation (engine + site)', () => {
    expect(selectAreas(['.github/workflows/ci.yml'])).toEqual({ engine: true, site: true });
    expect(selectAreas(['.github/workflows/_ci-checks.yml'])).toEqual({ engine: true, site: true });
  });

  it('lockfile / workspace-topology change triggers broad validation (engine + site)', () => {
    const lock = decide('pnpm-lock.yaml');
    expect(lock.areas).toEqual({ engine: true, site: true });
    expect(lock.lanes.unit).toBe(true);
    expect(lock.lanes.packageVerify).toBe(true);
    expect(lock.lanes.siteBuild).toBe(true);
    expect(selectAreas(['pnpm-workspace.yaml'])).toEqual({ engine: true, site: true });
  });

  it('shared exojs-config package source change triggers engine lanes (affects every build/test)', () => {
    const { areas } = decide('packages/exojs-config/vitest/index.ts');
    expect(areas.engine).toBe(true);
  });

  it('create-exo-app change does NOT trigger engine lanes (no engine/browser impact)', () => {
    const { areas, lanes } = decide('packages/create-exo-app/src/index.ts');
    expect(areas.engine).toBe(false);
    expect(lanes.unit).toBe(false);
    expect(lanes.browserWebgpu).toBe(false);
    expect(lanes.packageVerify).toBe(false);
    // It still counts as a packages/** change for the docs/site lane.
    expect(areas.site).toBe(true);
  });

  it('directional dependency (tilemap → tiled) needs no per-package routing: the unit lane runs ALL projects', () => {
    // A tilemap-only change validates the dependent tiled package transitively
    // because the unit lane runs every jsdom project, and triggers the browser
    // lanes (the root tilemap browser tests import both package sources).
    const { lanes } = decide('packages/exojs-tilemap/src/TileMapView.ts');
    expect(lanes.unit).toBe(true);
    expect(lanes.browserWebgl2).toBe(true);
    expect(lanes.packageVerify).toBe(true);
  });

  it('negative: a root docs-only change selects no engine and no site lanes', () => {
    const { areas, lanes } = decide('README.md');
    expect(areas).toEqual({ engine: false, site: false });
    expect(lanes.unit).toBe(false);
    expect(lanes.browserWebgpu).toBe(false);
    expect(lanes.packageVerify).toBe(false);
    expect(lanes.siteBuild).toBe(false);
    // Only the ungated lanes remain.
    expect(lanes.typecheck).toBe(true);
    expect(lanes.lint).toBe(true);
  });

  it('handles Windows backslash separators and blank/whitespace entries', () => {
    expect(selectAreas(['packages\\exojs-tilemap\\src\\TileMap.ts', '', '   '])).toEqual({ engine: true, site: true });
  });
});

describe('CI lane selection — PR #119 regression', () => {
  // The exact shape of PR #119 (the merged v0.13 hardening): only files under
  // the two extension packages. Before this fix `engine` stayed false, so the
  // unit, package-verify and all three browser lanes were SKIPPED while Required
  // CI still went green. This locks in the corrected behavior.
  const PR_119_FILES = [
    'packages/exojs-tiled/README.md',
    'packages/exojs-tiled/src/TiledMap.ts',
    'packages/exojs-tiled/src/public.ts',
    'packages/exojs-tiled/src/tiledMapBinding.ts',
    'packages/exojs-tiled/src/tiledOptions.ts',
    'packages/exojs-tiled/src/tiledRuntimeMapBinding.ts',
    'packages/exojs-tiled/test/extension.test.ts',
    'packages/exojs-tiled/test/fixtures/orthogonal-rich.tmj',
    'packages/exojs-tiled/test/fixtures/tileset-b.tsj',
    'packages/exojs-tiled/test/tiledLoadOptions.test.ts',
    'packages/exojs-tiled/test/tiledRuntimeMapBinding.test.ts',
    'packages/exojs-tiled/test/toTileMap.test.ts',
    'packages/exojs-tilemap/README.md',
    'packages/exojs-tilemap/src/TileMapBand.ts',
    'packages/exojs-tilemap/src/chunkGeometry.ts',
    'packages/exojs-tilemap/test/view.test.ts',
  ];

  it('selects every lane that PR #119 wrongly skipped', () => {
    const { areas, lanes } = decide(...PR_119_FILES);
    expect(areas).toEqual({ engine: true, site: true });
    // Previously skipped — must now run:
    expect(lanes.unit).toBe(true);
    expect(lanes.coverage).toBe(true);
    expect(lanes.packageVerify).toBe(true);
    expect(lanes.browserWebgl2).toBe(true);
    expect(lanes.browserWebgpu).toBe(true);
    expect(lanes.browserFirefox).toBe(true);
    // Always ran, still run:
    expect(lanes.typecheck).toBe(true);
    expect(lanes.lint).toBe(true);
    expect(lanes.siteBuild).toBe(true);
  });
});
