import { ARCHETYPES, buildMatrix } from '../src/rendering/archetypes';
import type { ArchetypeSpec, Backend, EngineAdapter } from '../src/rendering/EngineAdapter';
import { cameraCenterAt, GRID_MARGIN, isScrolling, SPRITE_SIZE, VIEWPORT_HEIGHT, VIEWPORT_WIDTH, visibleLeafCount, worldExtent } from '../src/rendering/world';

const scrollingWorld = ARCHETYPES.find(archetype => archetype.id === 'scrolling-world')!;

/** Frames sampled across a long stretch of the camera path, including several reflections off the world edges. */
const SAMPLE_FRAMES = [0, 1, 7, 60, 120, 199, 331, 512, 900, 1_337];

describe('scrolling-world archetype', () => {
  test('is the only archetype with off-screen content and a moving camera', () => {
    const scrolling = ARCHETYPES.filter(isScrolling);
    const culling = ARCHETYPES.filter(archetype => archetype.cullingEnabled);

    expect(scrolling.map(archetype => archetype.id)).toEqual(['scrolling-world']);
    expect(culling.map(archetype => archetype.id)).toEqual(['scrolling-world']);
  });

  test('lays its nodes out over four times the viewport area', () => {
    const world = worldExtent(scrollingWorld, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    expect(world.width).toBe(VIEWPORT_WIDTH * 2);
    expect(world.height).toBe(VIEWPORT_HEIGHT * 2);
    expect((world.width * world.height) / (VIEWPORT_WIDTH * VIEWPORT_HEIGHT)).toBe(4);
  });

  test('is otherwise identical to static-heavy, so the delta is the camera and the off-screen content', () => {
    const staticHeavy = ARCHETYPES.find(archetype => archetype.id === 'static-heavy')!;

    expect(scrollingWorld.nodeCounts).toEqual(staticHeavy.nodeCounts);
    expect(scrollingWorld.nestingDepth).toBe(staticHeavy.nestingDepth);
    expect(scrollingWorld.textureCount).toBe(staticHeavy.textureCount);
    expect(scrollingWorld.mutationFraction).toBe(staticHeavy.mutationFraction);
  });
});

describe('cameraCenterAt', () => {
  test('is a closed form in the frame index, so repeated evaluation agrees', () => {
    for (const frame of SAMPLE_FRAMES) {
      expect(cameraCenterAt(scrollingWorld, frame, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)).toEqual(
        cameraCenterAt(scrollingWorld, frame, VIEWPORT_WIDTH, VIEWPORT_HEIGHT),
      );
    }
  });

  test('never lets the view leave the world', () => {
    const world = worldExtent(scrollingWorld, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    for (let frame = 0; frame < 2_000; frame++) {
      const centre = cameraCenterAt(scrollingWorld, frame, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

      expect(centre.x - VIEWPORT_WIDTH / 2).toBeGreaterThanOrEqual(0);
      expect(centre.y - VIEWPORT_HEIGHT / 2).toBeGreaterThanOrEqual(0);
      expect(centre.x + VIEWPORT_WIDTH / 2).toBeLessThanOrEqual(world.width);
      expect(centre.y + VIEWPORT_HEIGHT / 2).toBeLessThanOrEqual(world.height);
    }
  });

  test('travels at the archetype rate, slowing only in the frame that crosses a wall', () => {
    const speed = scrollingWorld.cameraSpeed!;

    let atSpeed = 0;

    for (let frame = 1; frame < 2_000; frame++) {
      const previous = cameraCenterAt(scrollingWorld, frame - 1, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
      const current = cameraCenterAt(scrollingWorld, frame, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
      const step = Math.hypot(current.x - previous.x, current.y - previous.y);

      // A reflection splits one frame's travel between two directions, so that
      // frame's straight-line displacement is shorter; it can never be longer.
      expect(step).toBeLessThanOrEqual(speed + 1e-9);

      if (Math.abs(step - speed) < 1e-9) {
        atSpeed++;
      }
    }

    // Reflections are rare (a wall every ~160 or ~90 frames per axis), so the
    // overwhelming majority of frames move at exactly the archetype's rate.
    expect(atSpeed).toBeGreaterThan(1_900);
  });

  test('parks a non-scrolling archetype in the middle of its viewport-sized world', () => {
    const staticHeavy = ARCHETYPES.find(archetype => archetype.id === 'static-heavy')!;

    expect(cameraCenterAt(staticHeavy, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)).toEqual({ x: VIEWPORT_WIDTH / 2, y: VIEWPORT_HEIGHT / 2 });
    expect(cameraCenterAt(staticHeavy, 500, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)).toEqual({ x: VIEWPORT_WIDTH / 2, y: VIEWPORT_HEIGHT / 2 });
  });
});

describe('off-screen fraction', () => {
  test('keeps roughly three quarters of the world off-screen on every sampled frame', () => {
    const nodeCount = 25_000;

    for (const frame of SAMPLE_FRAMES) {
      const visible = visibleLeafCount(scrollingWorld, nodeCount, frame, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, GRID_MARGIN, SPRITE_SIZE);
      const fraction = visible / nodeCount;

      // The grid is inset by GRID_MARGIN and the view can reach the world edge,
      // so the visible share sits slightly above the naive area ratio of 0.25
      // near a wall. A band around it is the honest assertion; the point is that
      // the majority of the scene is off-screen in every frame.
      expect(fraction).toBeGreaterThan(0.2);
      expect(fraction).toBeLessThan(0.32);
    }
  });

  test('leaves nothing off-screen on a non-scrolling archetype', () => {
    const staticHeavy = ARCHETYPES.find(archetype => archetype.id === 'static-heavy')!;
    const nodeCount = 5_000;

    expect(visibleLeafCount(staticHeavy, nodeCount, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, GRID_MARGIN, SPRITE_SIZE)).toBe(nodeCount);
  });
});

describe('arm coverage', () => {
  const fakeAdapter = (engine: string, config: string, coversArchetype?: (spec: ArchetypeSpec) => boolean): EngineAdapter =>
    ({
      engine,
      config,
      supports: (backend: Backend) => backend === 'webgl2',
      ...(coversArchetype !== undefined && { coversArchetype }),
      init: async () => undefined,
      buildScene: () => undefined,
      mutate: () => undefined,
      renderFrame: () => undefined,
      teardown: () => undefined,
    }) satisfies EngineAdapter;

  test('an arm without a coverage predicate is measured on every archetype', () => {
    const cells = buildMatrix([fakeAdapter('exojs', 'current')], ['webgl2']);
    const covered = new Set(cells.map(cell => cell.archetype));

    expect(covered.size).toBe(ARCHETYPES.length);
  });

  test('the culled Pixi variant is measured only where culling can remove something', () => {
    const cells = buildMatrix([fakeAdapter('pixi', 'culled', spec => spec.cullingEnabled)], ['webgl2']);

    expect(new Set(cells.map(cell => cell.archetype))).toEqual(new Set(['scrolling-world']));
    expect(cells.map(cell => cell.nodeCount)).toEqual([...scrollingWorld.nodeCounts]);
  });

  test('arms without a camera sit the scrolling archetypes out', () => {
    const cells = buildMatrix([fakeAdapter('phaser', 'default', spec => !isScrolling(spec))], ['webgl2']);

    expect(cells.some(cell => cell.archetype === 'scrolling-world')).toBe(false);
    expect(cells.length).toBeGreaterThan(0);
  });
});
