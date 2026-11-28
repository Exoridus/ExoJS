/**
 * System lifecycle hooks and context: what a registry tells the systems it
 * owns, and when, on a bare registry and through the real scene lifecycle.
 */
import { Application } from '#core/Application';
import { Scene } from '#core/scene/Scene';
import type { SystemContext } from '#core/System';
import { SystemRegistry } from '#core/SystemRegistry';

import { setLastFrameTimestamp } from '../support/application-frame-loop';

vi.mock('#rendering/OutputTransform', async importOriginal => {
  const actual = await importOriginal<typeof import('#rendering/OutputTransform')>();

  class StubOutputTransform extends actual.OutputTransform {
    public override present(): void {}
  }

  return { ...actual, OutputTransform: StubOutputTransform };
});

vi.mock('#rendering/webgl2/WebGl2Backend', () => ({
  WebGl2Backend: vi.fn().mockImplementation(function () {
    return {
      onContextLost: { add: vi.fn(), destroy: vi.fn() },
      onContextRestored: { add: vi.fn(), destroy: vi.fn() },
      onRenderError: { add: vi.fn(), destroy: vi.fn() },
      stats: {
        frameTimeMs: 0,
        drawCalls: 0,
        culledNodes: 0,
        submittedNodes: 0,
        batches: 0,
        renderPasses: 0,
        renderTargetChanges: 0,
        frame: 0,
        rawFrameDeltaMs: 0,
      },
      resetStats: vi.fn().mockReturnThis(),
      flush: vi.fn().mockReturnThis(),
      initialize: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      resize: vi.fn().mockReturnThis(),
      view: { getBounds: vi.fn().mockReturnValue({ left: 0, top: 0, right: 800, bottom: 600 }) },
      renderTarget: {},
      rendererRegistry: { bindRenderer: vi.fn() },
      backendType: 'webgl2',
      setView: vi.fn().mockReturnThis(),
      draw: vi.fn().mockReturnThis(),
      // Runs the pass body the way a coordinator-less backend does, so the
      // frame's draw phase actually reaches the scene.
      execute: vi.fn().mockImplementation(function (this: unknown, pass: { execute(backend: unknown): void }) {
        pass.execute(this);

        return this;
      }),
      setRenderTarget: vi.fn().mockReturnThis(),
      resolveRenderTarget: vi.fn(),
      clearColor: { red: 0, green: 0, blue: 0, alpha: 1 },
      clear: vi.fn().mockReturnThis(),
      pushScissorRect: vi.fn().mockReturnThis(),
      popScissorRect: vi.fn().mockReturnThis(),
      acquireRenderTexture: vi.fn(),
      releaseRenderTexture: vi.fn().mockReturnThis(),
      composeWithAlphaMask: vi.fn().mockReturnThis(),
    };
  }),
}));

class Probe {
  public readonly log: string[] = [];
  public context: SystemContext | null = null;

  public constructor(public readonly name = 'probe') {}

  public onAttach(context: SystemContext): void {
    this.context = context;
    this.log.push('attach');
  }

  public onEnable(): void {
    this.log.push('enable');
  }

  public onDisable(): void {
    this.log.push('disable');
  }

  public onDetach(): void {
    this.log.push('detach');
  }

  public update(): void {
    this.log.push('update');
  }

  public destroy(): void {
    this.log.push('destroy');
  }
}

class OtherProbe extends Probe {}

const frame = (registry: SystemRegistry, during?: () => void): void => {
  registry._beginFrame();
  registry._update(0.016 as never);
  during?.();
  registry._endFrame();
};

describe('SystemRegistry lifecycle', () => {
  test('an add outside a frame attaches and enables at once, and the system runs', () => {
    const registry = new SystemRegistry();
    const probe = registry.add(new Probe());

    frame(registry);

    expect(probe.log).toEqual(['attach', 'enable', 'update']);
    expect(probe.context?.systems).toBe(registry);
    expect(probe.context?.scene).toBeNull();
  });

  test('a buffered add attaches inside add() and enables at the boundary', () => {
    const registry = new SystemRegistry();
    const probe = new Probe();

    frame(registry, () => {
      registry.add(probe);
      expect(probe.log).toEqual(['attach']);
    });

    expect(probe.log).toEqual(['attach', 'enable']);
    frame(registry);
    expect(probe.log).toEqual(['attach', 'enable', 'update']);
  });

  test('a removal during a frame disables at once and detaches at the boundary', () => {
    const registry = new SystemRegistry();
    const probe = registry.add(new Probe());

    probe.log.length = 0;
    frame(registry, () => {
      registry.remove(probe);
      expect(probe.log).toEqual(['update', 'disable']);
    });

    expect(probe.log).toEqual(['update', 'disable', 'detach']);
  });

  test('cancelling a buffered add detaches it without ever enabling it', () => {
    const registry = new SystemRegistry();
    const probe = new Probe();

    frame(registry, () => {
      registry.add(probe);
      registry.remove(probe);
    });

    expect(probe.log).toEqual(['attach', 'detach']);
  });

  test('destruction disables, detaches and destroys each system in reverse order', () => {
    const registry = new SystemRegistry();
    const order: string[] = [];
    const a = registry.add(new Probe('a'));
    const b = registry.add(new Probe('b'));

    for (const probe of [a, b]) {
      probe.onDisable = () => order.push(`${probe.name}:disable`);
      probe.onDetach = () => order.push(`${probe.name}:detach`);
      probe.destroy = () => order.push(`${probe.name}:destroy`);
    }

    registry.destroy();

    expect(order).toEqual(['b:disable', 'b:detach', 'b:destroy', 'a:disable', 'a:detach', 'a:destroy']);
  });

  test('a throwing onAttach registers nothing and propagates', () => {
    const registry = new SystemRegistry();
    const probe = new Probe();

    probe.onAttach = () => {
      throw new Error('attach failed');
    };

    expect(() => registry.add(probe)).toThrow('attach failed');
    expect(registry.has(probe)).toBe(false);
    expect(registry.size).toBe(0);
  });

  test('a throwing onEnable is reported and leaves the system registered but silent', () => {
    const registry = new SystemRegistry();
    const probe = new Probe();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    probe.onEnable = () => {
      throw new Error('enable failed');
    };

    registry.add(probe);
    frame(registry);

    expect(registry.has(probe)).toBe(true);
    expect(probe.log).toEqual(['attach']);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  test('a registry with no application refuses context.app', () => {
    const registry = new SystemRegistry();
    const probe = registry.add(new Probe());

    expect(() => probe.context!.app).toThrow(/belongs to no application/);
  });
});

describe('SystemRegistry.find', () => {
  test('finds the one instance of a class, buffered adds included', () => {
    const registry = new SystemRegistry();
    const probe = registry.add(new Probe());

    expect(registry.find(Probe)).toBe(probe);
    expect(registry.find(OtherProbe)).toBeNull();

    frame(registry, () => {
      const other = registry.add(new OtherProbe());

      expect(registry.find(OtherProbe)).toBe(other);
    });
  });

  test('refuses to guess between several matches; findAll lists them', () => {
    const registry = new SystemRegistry();
    const probe = registry.add(new Probe());
    const other = registry.add(new OtherProbe());

    expect(() => registry.find(Probe)).toThrow(/more than one/);
    expect(registry.findAll(Probe)).toEqual([probe, other]);

    registry.remove(other);
    expect(registry.find(Probe)).toBe(probe);
  });
});

describe('scene system lifecycle', () => {
  const trace: string[] = [];

  class Tracked extends Probe {
    public override onAttach(context: SystemContext): void {
      super.onAttach(context);
      trace.push(`attach:${context.scene?.constructor.name}`);
    }

    public override onEnable(): void {
      trace.push('enable');
    }

    public override onDisable(): void {
      trace.push('disable');
    }

    public override onDetach(): void {
      trace.push('detach');
    }

    public override destroy(): void {
      trace.push('destroy');
    }
  }

  let system: Tracked | null = null;

  class Owner extends Scene {
    public override init(): void {
      system = this.systems.add(new Tracked());
      trace.push('init');
    }

    public override unload(): void {
      trace.push('unload');
    }
  }

  class Next extends Scene {}

  let app: Application | null = null;

  beforeEach(async () => {
    trace.length = 0;
    app = new Application({ backend: { type: 'webgl2' }, scenes: { owner: Owner, next: Next } });
    vi.spyOn(app.platform, 'requestFrame').mockReturnValue(1);
    vi.spyOn(app.platform, 'cancelFrame').mockImplementation(() => {});
    await app.start(Owner);
    setLastFrameTimestamp(app, 0);
  });

  afterEach(async () => {
    await app?.destroy();
    app = null;
  });

  test('context names the application and the scene; enabled from activation, not from init', () => {
    expect(trace).toEqual(['attach:Owner', 'init', 'enable']);
    expect(system!.context!.app).toBe(app);
    expect(system!.context!.scene).toBe(app!.scenes.currentScene);
  });

  test('pausing keeps it enabled; retention disables it and restoring enables it again', async () => {
    const owner = app!.scenes.currentScene!;

    trace.length = 0;
    app!.scenes.pause();
    app!.scenes.resume();
    expect(trace).toEqual([]);

    await app!.scenes.change(Next, { suspendCurrent: true });
    expect(trace).toEqual(['disable']);

    await app!.scenes.restore(Owner);
    expect(app!.scenes.currentScene).toBe(owner);
    expect(trace).toEqual(['disable', 'enable']);
  });

  test('teardown disables before unload, then detaches and destroys', async () => {
    trace.length = 0;
    await app!.scenes.change(Next);

    expect(trace).toEqual(['disable', 'unload', 'detach', 'destroy']);
  });
});
