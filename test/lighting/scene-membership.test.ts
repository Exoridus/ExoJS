/**
 * Scene-owned lighting: a system built from options alone takes its renderer,
 * application and scene from the registry it is added to, and lights and
 * occluder components join it through scene membership.
 */
import { LightmapLighting, OccluderComponent, PointLight } from '@codexo/exojs/lighting';

import type { Application } from '#core/Application';
import { Scene } from '#core/scene/Scene';
import { SceneScope } from '#core/scene/SceneScope';
import { Signal } from '#core/Signal';
import { SystemRegistry } from '#core/SystemRegistry';
import { Matrix } from '#math/Matrix';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { RenderPipeline } from '#rendering/RenderPipeline';
import { RenderTexture } from '#rendering/texture/RenderTexture';

const createApp = (): Application => {
  const app = {
    framePasses: new RenderPipeline(),
    frameTexture: new RenderTexture(64, 64),
    onResize: new Signal(),
    rendering: {
      supportsColorFormat: (): boolean => true,
      view: {
        center: { x: 32, y: 32 },
        width: 64,
        height: 64,
        rotation: 0,
        getBounds: (): Rectangle => new Rectangle(0, 0, 64, 64),
        getTransform: (): Matrix => new Matrix(),
        getInverseTransform: (): Matrix => new Matrix(),
      },
    },
    width: 64,
    height: 64,
    loader: { _releaseScope: vi.fn() },
    interaction: { attachRoot: vi.fn(), detachRoot: vi.fn(), attachUIRoot: vi.fn(), detachUIRoot: vi.fn() },
    onError: new Signal<[Error]>(),
  } as unknown as Application & { systems: SystemRegistry };

  (app as { systems: SystemRegistry }).systems = new SystemRegistry({
    app,
    scene: null,
    reportError: error => {
      throw error;
    },
  });

  return app;
};

const lightmapPasses = 6;

const prepared = async (init: (scene: Scene) => void, app = createApp()): Promise<{ app: Application; scope: SceneScope<void> }> => {
  class Lit extends Scene {
    public override init(): void {
      init(this);
    }
  }

  const scope = new SceneScope<void>(app, new Lit());

  await scope.prepare(undefined);

  return { app, scope };
};

describe('options-only lighting in scene.systems', () => {
  test('is in the frame while its scene is active, out of it while retained, and gone after teardown', async () => {
    let lighting: LightmapLighting | null = null;
    const { app, scope } = await prepared(scene => {
      lighting = scene.systems.add(new LightmapLighting());
    });

    expect(lighting!.quality).toBe('lightmap');
    expect(app.framePasses.size).toBe(0);

    scope.activate();
    expect(app.framePasses.size).toBe(lightmapPasses);

    scope.suspend();
    expect(app.framePasses.size).toBe(0);

    scope.restore();
    expect(app.framePasses.size).toBe(lightmapPasses);

    await scope.destroy();
    expect(app.framePasses.size).toBe(0);
  });

  test('reading the renderer before the system is added says how to fix it', () => {
    expect(() => new LightmapLighting().quality).toThrow(/added to app\.systems or a scene's systems/);
  });
});

describe('lights join through scene membership', () => {
  test('a light in the scene is registered on activation and released when it leaves', async () => {
    const light = new PointLight();
    let lighting: LightmapLighting | null = null;
    const { scope } = await prepared(scene => {
      lighting = scene.systems.add(new LightmapLighting());
      scene.root.addChild(light);
    });

    expect(lighting!.lights).toEqual([]);

    scope.activate();
    expect(lighting!.lights).toEqual([light]);

    light.parent!.removeChild(light);
    expect(lighting!.lights).toEqual([]);
  });

  test('a system added to an active scene takes in the lights already there', async () => {
    const light = new PointLight();
    const { scope } = await prepared(scene => {
      scene.root.addChild(light);
    });

    scope.activate();

    const lighting = scope.systems.add(new LightmapLighting());

    expect(lighting.lights).toEqual([light]);
  });

  test('an explicit registration is kept when the light leaves, and when the system is removed', async () => {
    const auto = new PointLight();
    const pinned = new PointLight();
    let lighting: LightmapLighting | null = null;
    const { scope } = await prepared(scene => {
      lighting = scene.systems.add(new LightmapLighting());
      scene.root.addChild(auto);
      scene.root.addChild(lighting.add(pinned));
    });

    scope.activate();
    expect(lighting!.lights).toEqual([pinned, auto]);

    scope.scene.root.removeChild(pinned);
    expect(lighting!.lights).toEqual([pinned, auto]);

    scope.systems.remove(lighting!);
    expect(lighting!.lights).toEqual([pinned]);
  });

  test('with two lighting systems nothing is guessed', async () => {
    const light = new PointLight();
    let first: LightmapLighting | null = null;
    let second: LightmapLighting | null = null;
    const { scope } = await prepared(scene => {
      first = scene.systems.add(new LightmapLighting());
      second = scene.systems.add(new LightmapLighting());
      scene.root.addChild(light);
    });

    scope.activate();

    expect(first!.lights).toEqual([]);
    expect(second!.lights).toEqual([]);
  });

  test('a scene without lighting falls back to the only one in app.systems', async () => {
    const app = createApp();
    const global = (app as unknown as { systems: SystemRegistry }).systems.add(new LightmapLighting());
    const light = new PointLight();
    const { scope } = await prepared(scene => {
      scene.root.addChild(light);
    }, app);

    scope.activate();

    expect(global.lights).toEqual([light]);
  });
});

describe('OccluderComponent', () => {
  test('registers its source while active and collects the node bounds as a closed outline', async () => {
    const wall = new Container();
    let lighting: LightmapLighting | null = null;

    wall.getLocalBounds = (): Rectangle => new Rectangle(0, 0, 10, 4);

    const occluder = wall.addComponent(new OccluderComponent());
    const { scope } = await prepared(scene => {
      lighting = scene.systems.add(new LightmapLighting());
      scene.root.addChild(wall);
    });

    expect(lighting!.occluders).toEqual([]);

    scope.activate();
    expect(lighting!.occluders).toEqual([occluder.source]);

    const segments: number[][] = [];

    occluder.source.collect(new Rectangle(0, 0, 64, 64), {
      addSegment: () => {},
      addPolyline: (points, closed) => segments.push([...Array.from(points), closed ? 1 : 0]),
      addDrawable: () => false,
    });
    expect(segments).toEqual([[0, 0, 10, 0, 10, 4, 0, 4, 1]]);

    occluder.enabled = false;
    expect(lighting!.occluders).toEqual([]);
  });

  test('an explicit lighting option wins over scene membership', async () => {
    const wall = new Container();
    const chosen = new LightmapLighting(createApp());
    const occluder = wall.addComponent(new OccluderComponent('bounds', { lighting: chosen }));
    const { scope } = await prepared(scene => {
      scene.systems.add(new LightmapLighting());
      scene.systems.add(new LightmapLighting());
      scene.root.addChild(wall);
    });

    scope.activate();

    expect(chosen.occluders).toEqual([occluder.source]);
  });
});

const appSystems = (app: Application): SystemRegistry => (app as unknown as { systems: SystemRegistry }).systems;

/** Lets `app.systems` members see `scope`'s scene as the one on screen. */
const showing = (app: Application, scope: SceneScope<void>): void => {
  (app as unknown as { scenes: { currentScene: Scene } }).scenes = { currentScene: scope.scene };
};

describe('options-only lighting in app.systems', () => {
  test('is in the frame while registered, leaves it on removal, and builds a new renderer when added again', () => {
    const app = createApp();
    const lighting = new LightmapLighting();

    appSystems(app).add(lighting);
    expect(app.framePasses.size).toBe(lightmapPasses);
    expect(lighting.quality).toBe('lightmap');

    appSystems(app).remove(lighting);
    expect(app.framePasses.size).toBe(0);
    expect(() => lighting.quality).toThrow(/added to app\.systems/);

    const other = createApp();

    appSystems(other).add(lighting);
    expect(other.framePasses.size).toBe(lightmapPasses);
    expect(app.framePasses.size).toBe(0);

    expect(() => appSystems(app).add(lighting)).toThrow('already belongs to another system registry');
    appSystems(other).destroy();
    expect(other.framePasses.size).toBe(0);
  });

  test('a buffered add cancelled in the same frame leaves no frame passes or renderer behind', () => {
    const app = createApp();
    const lighting = new LightmapLighting();
    const systems = appSystems(app);

    systems._beginFrame();
    systems.add(lighting);
    systems.remove(lighting);
    systems._endFrame();

    expect(app.framePasses.size).toBe(0);
    expect(() => lighting.quality).toThrow(/added to app\.systems/);
  });
});

describe('automatic association follows registry changes', () => {
  test('app lighting added while a scene is on screen takes in its lights', async () => {
    const app = createApp();
    const light = new PointLight();
    const { scope } = await prepared(scene => scene.root.addChild(light), app);

    scope.activate();
    showing(app, scope);

    const global = appSystems(app).add(new LightmapLighting());

    expect(global.lights).toEqual([light]);
  });

  test('scene lighting added later takes over lights that joined app lighting, and hands them back when removed', async () => {
    const app = createApp();
    const global = appSystems(app).add(new LightmapLighting());
    const light = new PointLight();
    const { scope } = await prepared(scene => scene.root.addChild(light), app);

    scope.activate();
    showing(app, scope);
    expect(global.lights).toEqual([light]);

    const local = scope.systems.add(new LightmapLighting());

    expect(local.lights).toEqual([light]);
    expect(global.lights).toEqual([]);

    scope.systems.remove(local);
    expect(local.lights).toEqual([]);
    expect(global.lights).toEqual([light]);
  });

  test('a second scene lighting makes the choice ambiguous; removing one leaves the other in charge', async () => {
    const light = new PointLight();
    const wall = new Container();

    wall.getLocalBounds = (): Rectangle => new Rectangle(0, 0, 10, 4);

    const occluder = wall.addComponent(new OccluderComponent());
    let first: LightmapLighting | null = null;
    const { scope } = await prepared(scene => {
      first = scene.systems.add(new LightmapLighting());
      scene.root.addChild(light, wall);
    });

    scope.activate();
    expect(first!.lights).toEqual([light]);
    expect(first!.occluders).toEqual([occluder.source]);

    const second = scope.systems.add(new LightmapLighting());

    expect(first!.lights).toEqual([]);
    expect(second.lights).toEqual([]);
    expect(first!.occluders).toEqual([]);

    scope.systems.remove(first!);
    expect(second.lights).toEqual([light]);
    expect(second.occluders).toEqual([occluder.source]);
  });

  test('an explicit registration is never moved by registry changes', async () => {
    const app = createApp();
    const global = appSystems(app).add(new LightmapLighting());
    const light = new PointLight();
    const { scope } = await prepared(scene => scene.root.addChild(global.add(light)), app);

    scope.activate();
    showing(app, scope);
    scope.systems.add(new LightmapLighting());

    expect(global.lights).toEqual([light]);
  });

  test('tearing a scene down leaves none of its lights with app lighting', async () => {
    const app = createApp();
    const global = appSystems(app).add(new LightmapLighting());
    const light = new PointLight();
    const { scope } = await prepared(scene => {
      scene.systems.add(new LightmapLighting());
      scene.root.addChild(light);
    }, app);

    scope.activate();
    showing(app, scope);
    await scope.destroy();

    expect(global.lights).toEqual([]);
  });
});

describe('OccluderComponent reattachment', () => {
  test('a component moved to another node registers a source for the new node only', async () => {
    const first = new Container();
    const second = new Container();

    first.getLocalBounds = (): Rectangle => new Rectangle(0, 0, 10, 4);
    second.getLocalBounds = (): Rectangle => new Rectangle(0, 0, 2, 2);
    second.x = 20;

    const occluder = first.addComponent(new OccluderComponent());
    let lighting: LightmapLighting | null = null;
    const { scope } = await prepared(scene => {
      lighting = scene.systems.add(new LightmapLighting());
      scene.root.addChild(first, second);
    });

    scope.activate();

    const old = occluder.source;

    first.removeComponent(occluder);
    expect(lighting!.occluders).toEqual([]);
    expect(() => occluder.source).toThrow(/attached to a node/);

    second.addComponent(occluder);
    expect(occluder.source).not.toBe(old);
    expect(lighting!.occluders).toEqual([occluder.source]);

    const segments: number[][] = [];

    occluder.source.collect(new Rectangle(0, 0, 64, 64), {
      addSegment: () => {},
      addPolyline: (points, closed) => segments.push([...Array.from(points), closed ? 1 : 0]),
      addDrawable: () => false,
    });
    expect(segments).toEqual([[20, 0, 22, 0, 22, 2, 20, 2, 1]]);
  });

  test('a source passed as the shape is reused, not rebuilt, across nodes', async () => {
    const source = { collect: vi.fn() };
    const first = new Container();
    const second = new Container();
    const occluder = first.addComponent(new OccluderComponent(source));

    first.removeComponent(occluder);
    second.addComponent(occluder);
    expect(occluder.source).toBe(source);
  });
});

describe('OccluderComponent bounds of nodes without an extent of their own', () => {
  test('a container uses the world box around its content', () => {
    const group = new Container();
    const child = new Container();

    child.getLocalBounds = (): Rectangle => new Rectangle(0, 0, 10, 4);
    child.x = 5;
    group.addChild(child);
    group.y = 2;

    const occluder = group.addComponent(new OccluderComponent());
    const segments: number[][] = [];

    occluder.source.collect(new Rectangle(0, 0, 64, 64), {
      addSegment: () => {},
      addPolyline: (points, closed) => segments.push([...Array.from(points), closed ? 1 : 0]),
      addDrawable: () => false,
    });
    expect(segments).toEqual([[5, 2, 15, 2, 15, 6, 5, 6, 1]]);
  });
});
