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

  test('a throwing onEnable is reported, gets onDisable, and leaves the system registered but silent', () => {
    const registry = new SystemRegistry();
    const probe = new Probe();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    probe.onEnable = () => {
      throw new Error('enable failed');
    };

    registry.add(probe);
    frame(registry);

    expect(registry.has(probe)).toBe(true);
    expect(probe.log).toEqual(['attach', 'disable']);
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

describe('SystemRegistry ownership and reentrancy', () => {
  test('a system belongs to one registry: a second add throws before any hook and leaves the owner running', () => {
    const first = new SystemRegistry();
    const second = new SystemRegistry();
    const probe = first.add(new Probe());

    probe.log.length = 0;
    expect(() => second.add(probe)).toThrow('already belongs to another system registry');
    expect(second.has(probe)).toBe(false);
    expect(second.size).toBe(0);
    frame(second);
    frame(first);
    expect(probe.log).toEqual(['update']);
    expect(probe.context?.systems).toBe(first);
  });

  test('two applications cannot share one system instance', async () => {
    const first = new Application({ backend: { type: 'webgl2' } });
    const second = new Application({ backend: { type: 'webgl2' } });
    const probe = first.systems.add(new Probe());

    expect(() => second.systems.add(probe)).toThrow('already belongs to another system registry');
    await first.destroy();
    expect(probe.log.filter(entry => entry === 'destroy')).toEqual(['destroy']);
    await second.destroy();
    expect(probe.log.filter(entry => entry === 'destroy')).toEqual(['destroy']);
  });

  test('distinct instances of one class register with different registries', () => {
    const first = new SystemRegistry();
    const second = new SystemRegistry();

    first.add(new Probe());
    second.add(new Probe());
    expect(first.size).toBe(1);
    expect(second.size).toBe(1);
  });

  test('a buffered add already owns the system', () => {
    const first = new SystemRegistry();
    const second = new SystemRegistry();
    const probe = new Probe();

    frame(first, () => {
      first.add(probe);
      expect(() => second.add(probe)).toThrow('already belongs to another system registry');
    });
    expect(first.has(probe)).toBe(true);
  });

  test('removal releases ownership at detach, so the system can move', () => {
    const first = new SystemRegistry();
    const second = new SystemRegistry();
    const probe = first.add(new Probe());

    first.remove(probe);
    second.add(probe);
    expect(probe.log).toEqual(['attach', 'enable', 'disable', 'detach', 'attach', 'enable']);
    expect(probe.context?.systems).toBe(second);
  });

  test("a system removed during the old owner's frame is detached there before the new owner attaches it", () => {
    const first = new SystemRegistry();
    const second = new SystemRegistry();
    const probe = first.add(new Probe());

    probe.log.length = 0;
    frame(first, () => {
      first.remove(probe);
      second.add(probe);
      expect(probe.log).toEqual(['update', 'disable', 'detach', 'attach', 'enable']);
    });
    frame(first);
    frame(second);
    expect(probe.log).toEqual(['update', 'disable', 'detach', 'attach', 'enable', 'update']);
  });

  test('a throwing onRemove listener still detaches exactly once and releases ownership', () => {
    const registry = new SystemRegistry();
    const other = new SystemRegistry();
    const probe = registry.add(new Probe());

    registry.onRemove.add(() => {
      throw new Error('listener failed');
    });

    expect(() => registry.remove(probe)).toThrow('listener failed');
    expect(probe.log).toEqual(['attach', 'enable', 'disable', 'detach']);
    expect(registry.has(probe)).toBe(false);

    other.add(probe);
    expect(other.has(probe)).toBe(true);
    expect(probe.log.filter(entry => entry === 'detach')).toEqual(['detach']);
  });

  test('a throwing onRemove listener at the frame boundary still detaches and allows a later registration', () => {
    const registry = new SystemRegistry();
    const probe = registry.add(new Probe());

    registry.onRemove.add(() => {
      throw new Error('listener failed');
    });
    probe.log.length = 0;

    expect(() =>
      frame(registry, () => {
        registry.remove(probe);
      }),
    ).toThrow('listener failed');
    expect(probe.log).toEqual(['update', 'disable', 'detach']);

    registry.onRemove.clear();
    registry.add(probe);
    frame(registry);
    expect(probe.log).toEqual(['update', 'disable', 'detach', 'attach', 'enable', 'update']);
  });

  test('onAttach removing its own system cancels the registration cleanly', () => {
    const registry = new SystemRegistry();
    const added = vi.fn();
    const probe = new Probe();

    registry.onAdd.add(added);

    probe.onAttach = () => {
      probe.log.push('attach');
      registry.remove(probe);
    };

    expect(registry.add(probe)).toBe(probe);
    frame(registry);
    expect(probe.log).toEqual(['attach', 'detach']);
    expect(registry.size).toBe(0);
    expect(added).not.toHaveBeenCalled();

    probe.onAttach = () => probe.log.push('attach');
    new SystemRegistry().add(probe);
    expect(probe.log).toEqual(['attach', 'detach', 'attach', 'enable']);
  });

  test('onAttach removing its own buffered system cancels it before the boundary', () => {
    const registry = new SystemRegistry();
    const probe = new Probe();

    probe.onAttach = () => {
      probe.log.push('attach');
      registry.remove(probe);
    };

    frame(registry, () => registry.add(probe));
    frame(registry);
    expect(probe.log).toEqual(['attach', 'detach']);
    expect(registry.size).toBe(0);
  });

  test('onAttach adding its own system again is the duplicate no-op, immediate or buffered', () => {
    for (const buffered of [false, true]) {
      const registry = new SystemRegistry();
      const probe = new Probe();

      probe.onAttach = () => {
        probe.log.push('attach');
        registry.add(probe);
      };

      if (buffered) {
        frame(registry, () => registry.add(probe));
      } else {
        registry.add(probe);
      }

      frame(registry);
      expect(probe.log).toEqual(['attach', 'enable', 'update']);
      expect(registry.size).toBe(1);
    }
  });

  test('onAttach may add and remove other systems', () => {
    const registry = new SystemRegistry();
    const victim = registry.add(new Probe('victim'));
    const helper = new OtherProbe('helper');
    const probe = new Probe();

    probe.onAttach = () => {
      registry.add(helper);
      registry.remove(victim);
    };

    registry.add(probe);
    frame(registry);
    expect(registry.size).toBe(2);
    expect(registry.has(helper)).toBe(true);
    expect(registry.has(victim)).toBe(false);
    expect(helper.log).toEqual(['attach', 'enable', 'update']);
    expect(victim.log).toEqual(['attach', 'enable', 'disable', 'detach']);
  });

  test('onEnable removing its own system leaves no phase entry, count or onAdd behind', () => {
    const registry = new SystemRegistry();
    const added = vi.fn();
    const probe = new Probe();

    registry.onAdd.add(added);

    probe.onEnable = () => {
      probe.log.push('enable');
      registry.remove(probe);
    };

    registry.add(probe);
    frame(registry);
    expect(probe.log).toEqual(['attach', 'enable', 'disable', 'detach']);
    expect(registry.size).toBe(0);
    expect(added).not.toHaveBeenCalled();
  });

  test('a system removing and re-adding itself during a phase does not skip the systems after it', () => {
    const registry = new SystemRegistry();
    const a = registry.add(new Probe('a'));
    const b = registry.add(new Probe('b'));
    const c = registry.add(new Probe('c'));
    let moved = false;

    a.update = () => {
      a.log.push('update');

      if (!moved) {
        moved = true;
        registry.remove(a);
        registry.add(a, { order: 10 });
      }
    };

    frame(registry);
    expect(b.log.at(-1)).toBe('update');
    expect(c.log.at(-1)).toBe('update');

    const order: string[] = [];

    for (const probe of [a, b, c]) {
      probe.update = () => order.push(probe.name);
    }

    frame(registry);
    expect(order).toEqual(['b', 'c', 'a']);
  });

  test('a buffered add rejected for a cycle at the boundary is detached and released', () => {
    const registry = new SystemRegistry();
    const other = new SystemRegistry();
    const a = registry.add(new Probe('a'));
    const b = new Probe('b');

    expect(() => frame(registry, () => registry.add(b, { before: [a], after: [a] }))).toThrow('cycle detected');
    expect(b.log).toEqual(['attach', 'detach']);
    expect(registry.has(b)).toBe(false);
    other.add(b);
    expect(other.has(b)).toBe(true);
  });
});

describe('SystemRegistry reentrant removal', () => {
  test('onDisable re-adding its own system during remove() leaves exactly one live registration', () => {
    for (const inFrame of [false, true]) {
      const registry = new SystemRegistry();
      const other = new SystemRegistry();
      const probe = registry.add(new Probe());
      let readded = false;

      probe.onDisable = () => {
        probe.log.push('disable');

        if (!readded) {
          readded = true;
          registry.add(probe);
        }
      };

      if (inFrame) {
        frame(registry, () => registry.remove(probe));
      } else {
        registry.remove(probe);
      }

      expect(registry.has(probe)).toBe(true);
      expect(registry.size).toBe(1);
      expect(() => other.add(probe)).toThrow('already belongs to another system registry');

      probe.log.length = 0;
      frame(registry);
      expect(probe.log).toEqual(['update']);

      expect(registry.remove(probe)).toBe(true);
      expect(registry.size).toBe(0);
      other.add(probe);
      expect(other.has(probe)).toBe(true);
    }
  });

  test('an onRemove listener may register the system again, here or in another registry', () => {
    const registry = new SystemRegistry();
    const other = new SystemRegistry();
    const third = new SystemRegistry();
    const probe = registry.add(new Probe());

    registry.onRemove.add(system => {
      if (!registry.has(system)) {
        registry.add(system);
      }
    });
    registry.remove(probe);
    expect(probe.log).toEqual(['attach', 'enable', 'disable', 'detach', 'attach', 'enable']);
    expect(registry.has(probe)).toBe(true);
    expect(() => other.add(probe)).toThrow('already belongs to another system registry');

    registry.onRemove.clear();
    registry.onRemove.add(system => third.add(system));
    registry.remove(probe);
    expect(third.has(probe)).toBe(true);
    expect(registry.has(probe)).toBe(false);
  });

  test('a system that removes itself in onEnable is announced by neither onAdd nor onRemove', () => {
    const registry = new SystemRegistry();
    const signals: string[] = [];
    const probe = new Probe();

    registry.onAdd.add(() => signals.push('add'));
    registry.onRemove.add(() => signals.push('remove'));

    probe.onEnable = () => {
      registry.remove(probe);
    };

    registry.add(probe);
    expect(signals).toEqual([]);
  });

  test('destroying the registry from onAttach detaches the system being attached', () => {
    const registry = new SystemRegistry();
    const probe = new Probe();

    probe.onAttach = () => {
      probe.log.push('attach');
      registry.destroy();
    };

    registry.add(probe);
    expect(registry.has(probe)).toBe(false);
    expect(probe.log).toEqual(['attach', 'detach']);
    new SystemRegistry().add(probe);
  });

  test('a system its onDetach hands to another registry during destruction is not destroyed by the old one', () => {
    const registry = new SystemRegistry();
    const other = new SystemRegistry();
    const probe = registry.add(new Probe());

    probe.onDetach = () => {
      probe.log.push('detach');
      other.add(probe);
    };

    registry.destroy();
    expect(other.has(probe)).toBe(true);
    expect(probe.log).not.toContain('destroy');
  });
});

describe('SystemRegistry add() after a finalize that runs listeners', () => {
  test('an onRemove listener re-adding the system while add() finalizes its removal yields one registration', () => {
    const registry = new SystemRegistry();
    const probe = registry.add(new Probe());
    let reentered = false;

    registry.onRemove.add(system => {
      if (!reentered) {
        reentered = true;
        registry.add(system);
      }
    });

    frame(registry, () => {
      registry.remove(probe);
      registry.add(probe);
    });

    expect(registry.size).toBe(1);
    expect(registry.findAll(Probe)).toEqual([probe]);
    probe.log.length = 0;
    frame(registry);
    expect(probe.log).toEqual(['update']);
  });

  test("a listener of the old owner taking the system back makes the new owner's add() throw", () => {
    const first = new SystemRegistry();
    const second = new SystemRegistry();
    const probe = first.add(new Probe());

    first.onRemove.add(system => first.add(system));

    frame(first, () => {
      first.remove(probe);
      expect(() => second.add(probe)).toThrow('already belongs to another system registry');
    });

    expect(first.has(probe)).toBe(true);
    expect(second.has(probe)).toBe(false);
  });
});

describe('SystemRegistry frame-boundary drain under reentrant listeners', () => {
  test('a listener cancelling a later buffered add at the boundary keeps it out of the registry', () => {
    const registry = new SystemRegistry();
    const other = new SystemRegistry();
    const removed = registry.add(new Probe('removed'));
    const late = new Probe('late');

    registry.onRemove.add(system => {
      if (system === removed) {
        registry.remove(late);
      }
    });

    frame(registry, () => {
      registry.remove(removed);
      registry.add(late);
    });

    expect(registry.has(late)).toBe(false);
    expect(registry.size).toBe(0);
    expect(late.log).toEqual(['attach', 'detach']);
    other.add(late);
    late.log.length = 0;
    frame(registry);
    expect(late.log).toEqual([]);
  });

  test('a removal finalized early by another registry is not finalized again at the boundary', () => {
    const registry = new SystemRegistry();
    const other = new SystemRegistry();
    const first = registry.add(new Probe('first'));
    const second = registry.add(new Probe('second'));
    const removals: string[] = [];

    registry.onRemove.add(system => {
      removals.push((system as Probe).name);

      if (system === first) {
        other.add(second);
      }
    });

    frame(registry, () => {
      registry.remove(first);
      registry.remove(second);
    });

    expect(removals).toEqual(['first', 'second']);
    expect(other.has(second)).toBe(true);
    expect(second.log.filter(entry => entry === 'detach')).toEqual(['detach']);
  });
});
