import type { Application } from '#core/Application';
import { BehaviorComponent } from '#core/BehaviorComponent';
import { Component } from '#core/Component';
import type { ComponentQuery } from '#core/ComponentQuery';
import type { ComponentRuntime } from '#core/ComponentRuntime';
import { Scene } from '#core/scene/Scene';
import { SceneScope } from '#core/scene/SceneScope';
import { SceneNode } from '#core/SceneNode';
import { Signal } from '#core/Signal';
import { type Seconds, seconds } from '#core/units';
import { Container } from '#rendering/Container';
import type { RenderingContext } from '#rendering/RenderingContext';

const createAppStub = (): Application =>
  ({
    loader: { _releaseScope: vi.fn() },
    interaction: {
      attachRoot: vi.fn(),
      detachRoot: vi.fn(),
      attachUIRoot: vi.fn(),
      detachUIRoot: vi.fn(),
    },
    onError: new Signal<[Error]>(),
  }) as unknown as Application;

const step = seconds(1 / 60);

/** One frame as Application drives it: window open, fixed step, update, draw, window closed. */
const frame = (scope: SceneScope<void>, fixedSteps = 1): void => {
  scope._beginFrame();

  try {
    for (let i = 0; i < fixedSteps; i++) {
      scope.fixedUpdate(step);
    }

    scope.update(step);
    scope.draw({ render: () => {} } as unknown as RenderingContext);
  } finally {
    scope._endFrame();
  }
};

const activeScope = async (scene: Scene = new Scene(), app: Application = createAppStub()): Promise<SceneScope<void>> => {
  const scope = new SceneScope<void>(app, scene);

  await scope.prepare(undefined);
  scope.activate();

  return scope;
};

/** A fresh container carrying `component`. */
const holding = (component: Component): Container => {
  const container = new Container();

  container.addComponent(component);

  return container;
};

const runtimeOf = (scope: SceneScope<void>): ComponentRuntime => scope.componentRuntime(false)!;

class Tag extends Component {}

class Health extends Component {
  public current = 100;
}

class Armor extends Component {
  public value = 5;
}

class BossHealth extends Health {}

/** Records every lifecycle hook, prefixed with `name`. */
class Recorder extends Component {
  public constructor(
    private readonly _log: string[],
    private readonly _name = 'rec',
  ) {
    super();
  }

  protected override onAttach(): void {
    this._log.push(`${this._name}:attach`);
  }

  protected override onDetach(): void {
    this._log.push(`${this._name}:detach`);
  }

  protected override onEnable(): void {
    this._log.push(`${this._name}:enable`);
  }

  protected override onDisable(): void {
    this._log.push(`${this._name}:disable`);
  }

  protected override onDestroy(): void {
    this._log.push(`${this._name}:destroy`);
  }
}

class Ticker extends BehaviorComponent {
  public onUpdate: ((delta: Seconds) => void) | null = null;

  public constructor(
    private readonly _log: string[] = [],
    private readonly _name = 'tick',
  ) {
    super();
  }

  public override update(delta: Seconds): void {
    this._log.push(`${this._name}:update`);
    this.onUpdate?.(delta);
  }

  public override fixedUpdate(): void {
    this._log.push(`${this._name}:fixed`);
  }
}

class UpdateOnly extends BehaviorComponent {
  public updates = 0;

  public override update(): void {
    this.updates++;
  }
}

describe('Component on SceneNode (CMP-01)', () => {
  test('addComponent returns the same instance; get/has find it by exact class', () => {
    const node = new SceneNode();
    const health = new Health();

    expect(node.addComponent(health)).toBe(health);
    expect(node.getComponent(Health)).toBe(health);
    expect(node.hasComponent(Health)).toBe(true);
    expect(node.getComponent(Armor)).toBeNull();
    expect(node.hasComponent(Armor)).toBe(false);
    expect(health.node).toBe(node);
    expect(health.attached).toBe(true);
  });

  test('matching is by exact class: a subclass is not found under its base, and both can coexist', () => {
    const node = new SceneNode();
    const boss = node.addComponent(new BossHealth());

    expect(node.getComponent(Health)).toBeNull();
    expect(node.getComponent(BossHealth)).toBe(boss);

    const plain = node.addComponent(new Health());

    expect(node.components).toEqual([boss, plain]);
  });

  test('re-adding the attached instance is a no-op; a second instance of the class throws', () => {
    const log: string[] = [];
    const node = new SceneNode();
    const recorder = node.addComponent(new Recorder(log));

    expect(node.addComponent(recorder)).toBe(recorder);
    expect(log).toEqual(['rec:attach']);
    expect(() => node.addComponent(new Recorder(log))).toThrow(/already has a Recorder/);
    expect(node.getComponent(Recorder)).toBe(recorder);
  });

  test('a component attached elsewhere cannot be attached to a second node', () => {
    const a = new SceneNode();
    const b = new SceneNode();
    const tag = a.addComponent(new Tag());

    expect(() => b.addComponent(tag)).toThrow(/already attached to SceneNode/);
    expect(b.hasComponent(Tag)).toBe(false);
    expect(tag.node).toBe(a);
  });

  test('components is an ordered, frozen snapshot; a node without components shares the empty one', () => {
    const node = new SceneNode();

    expect(node.components).toEqual([]);
    expect(node.components).toBe(new SceneNode().components);

    const tag = node.addComponent(new Tag());
    const snapshot = node.components;

    node.addComponent(new Health());

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot).toEqual([tag]);
    expect(node.components).toHaveLength(2);
  });

  test('removeComponent by class or instance detaches without destroying; the component can be attached again', () => {
    const log: string[] = [];
    const a = new SceneNode();
    const b = new SceneNode();
    const recorder = a.addComponent(new Recorder(log));

    expect(a.removeComponent(Recorder)).toBe(recorder);
    expect(recorder.attached).toBe(false);
    expect(recorder.destroyed).toBe(false);
    expect(() => recorder.node).toThrow(/not attached/);
    expect(a.removeComponent(recorder)).toBeNull();

    b.addComponent(recorder);
    expect(b.removeComponent(recorder)).toBe(recorder);
    expect(log).toEqual(['rec:attach', 'rec:detach', 'rec:attach', 'rec:detach']);
  });

  test('removeComponent with an instance of the right class that is not the attached one returns null', () => {
    const node = new SceneNode();
    const attached = node.addComponent(new Tag());

    expect(node.removeComponent(new Tag())).toBeNull();
    expect(node.getComponent(Tag)).toBe(attached);
  });

  test('destroy detaches and ends the component; it cannot be attached again', () => {
    const log: string[] = [];
    const node = new SceneNode();
    const recorder = node.addComponent(new Recorder(log));

    recorder.destroy();
    recorder.destroy();

    expect(log).toEqual(['rec:attach', 'rec:detach', 'rec:destroy']);
    expect(recorder.destroyed).toBe(true);
    expect(node.hasComponent(Recorder)).toBe(false);
    expect(() => node.addComponent(recorder)).toThrow(/destroyed/);
  });

  test('destroying a node destroys its components, children first', () => {
    const log: string[] = [];
    const parent = new Container();
    const child = new Container();

    parent.addChild(child);
    parent.addComponent(new Recorder(log, 'parent'));
    child.addComponent(new Recorder(log, 'child'));

    parent.destroy();

    expect(log).toEqual(['parent:attach', 'child:attach', 'child:detach', 'child:destroy', 'parent:detach', 'parent:destroy']);
    expect(() => parent.addComponent(new Tag())).toThrow(/destroyed/);
  });

  test('a throwing onAttach rolls the attachment back', () => {
    class Faulty extends Component {
      protected override onAttach(): void {
        throw new Error('attach failed');
      }
    }

    const node = new SceneNode();
    const faulty = new Faulty();

    expect(() => node.addComponent(faulty)).toThrow('attach failed');
    expect(faulty.attached).toBe(false);
    expect(node.hasComponent(Faulty)).toBe(false);
    expect(node._componentNodes).toBe(0);
  });

  test('a thenable from a hook is rejected at runtime for untyped callers', () => {
    class AsyncAttach extends Component {
      protected override onAttach(): void {
        return Promise.resolve() as unknown as void;
      }
    }

    expect(() => new SceneNode().addComponent(new AsyncAttach())).toThrow(/AsyncAttach\.onAttach\(\)/);
  });

  test('component-node counts follow structure and drop back to zero', () => {
    const root = new Container();
    const branch = new Container();
    const leaf = new Container();

    root.addChild(branch);
    branch.addChild(leaf);
    leaf.addComponent(new Tag());
    leaf.addComponent(new Health());

    expect([root._componentNodes, branch._componentNodes, leaf._componentNodes]).toEqual([1, 1, 1]);

    branch.addComponent(new Tag());
    expect(root._componentNodes).toBe(2);

    root.removeChild(branch);
    expect(root._componentNodes).toBe(0);

    leaf.removeComponent(Tag);
    leaf.removeComponent(Health);
    branch.removeComponent(Tag);
    expect(branch._componentNodes).toBe(0);
  });
});

describe('Scene-local membership and lifecycle (CMP-02)', () => {
  test('components attached before the scene is attached join when it is, stay cold until activation', async () => {
    const log: string[] = [];
    const scene = new Scene();
    const node = new Container();

    node.addComponent(new Recorder(log));
    scene.addChild(node);

    expect(log).toEqual(['rec:attach']);

    const scope = new SceneScope<void>(createAppStub(), scene);

    expect(scene.query(Recorder).size).toBe(1);

    await scope.prepare(undefined);
    expect(log).toEqual(['rec:attach']);
    expect(node.getComponent(Recorder)!.active).toBe(false);

    scope.activate();
    expect(log).toEqual(['rec:attach', 'rec:enable']);
    expect(node.getComponent(Recorder)!.active).toBe(true);
  });

  test('a scene that never carries a component builds no runtime', async () => {
    const scope = await activeScope();

    frame(scope);
    expect(scope.componentRuntime(false)).toBeNull();
  });

  test('pause neither disables nor removes components, but stops behaviours', async () => {
    const log: string[] = [];
    const scope = await activeScope();
    const node = new Container();
    const ticker = node.addComponent(new Ticker(log));
    const recorder = node.addComponent(new Recorder(log));

    scope.scene.addChild(node);
    log.length = 0;

    scope.pause();
    frame(scope);

    expect(log).toEqual([]);
    expect(ticker.active).toBe(true);
    expect(recorder.active).toBe(true);
    expect(scope.scene.query(Ticker, Recorder).size).toBe(1);

    scope.resume();
    frame(scope);

    expect(log).toEqual(['tick:fixed', 'tick:update']);
  });

  test('suspend disables and restore re-enables, keeping component state', async () => {
    const log: string[] = [];
    const scope = await activeScope();
    const node = new Container();
    const health = node.addComponent(new Health());

    node.addComponent(new Recorder(log));
    scope.scene.addChild(node);
    health.current = 42;

    scope.suspend();
    expect(log).toEqual(['rec:attach', 'rec:enable', 'rec:disable']);
    expect(scope.scene.query(Health).size).toBe(1);

    scope.restore();
    expect(log).toEqual(['rec:attach', 'rec:enable', 'rec:disable', 'rec:enable']);
    expect(node.getComponent(Health)!.current).toBe(42);
  });

  test('permanent teardown disables before scene services go, then destroys with the root', async () => {
    const log: string[] = [];

    class TeardownScene extends Scene {
      public override unload(): void {
        log.push('scene:unload');
      }

      public override destroy(): void {
        log.push('scene:destroy');
      }
    }

    const scope = await activeScope(new TeardownScene());
    const node = new Container();

    node.addComponent(new Recorder(log));
    scope.scene.addChild(node);
    log.length = 0;

    await scope.destroy();

    expect(log).toEqual(['rec:disable', 'scene:unload', 'scene:destroy', 'rec:detach', 'rec:destroy']);
    expect(scope.componentRuntime(true)).toBeNull();
  });

  test('a failed activation drops members without ever enabling them', async () => {
    const log: string[] = [];
    const scene = new Scene();

    scene.root.addComponent(new Recorder(log));

    const scope = new SceneScope<void>(createAppStub(), scene);

    await scope.prepare(undefined);
    scope.destroyFailedActivation();

    expect(log).toEqual(['rec:attach', 'rec:detach', 'rec:destroy']);
  });

  test('the UI layer and the root itself are anchors', async () => {
    const log: string[] = [];
    const scope = await activeScope();
    const widget = new Container();

    scope.scene.root.addComponent(new Recorder(log, 'root'));
    widget.addComponent(new Recorder(log, 'ui'));
    scope.scene.ui.addChild(widget);

    expect(log).toEqual(['root:attach', 'root:enable', 'ui:attach', 'ui:enable']);
    expect(scope.scene.query(Recorder).size).toBe(2);
  });

  test('a node outside every scene never enables', () => {
    const log: string[] = [];
    const loose = new Container();

    loose.addComponent(new Recorder(log));
    new Container().addChild(loose);

    expect(log).toEqual(['rec:attach']);
  });

  test('a subtree leaving the scene disables and leaves queries; coming back re-enables', async () => {
    const log: string[] = [];
    const scope = await activeScope();
    const branch = new Container();
    const leaf = new Container();

    branch.addChild(leaf);
    leaf.addComponent(new Recorder(log));
    scope.scene.addChild(branch);

    scope.scene.removeChild(branch);
    expect(scope.scene.query(Recorder).size).toBe(0);

    scope.scene.addChild(branch);
    expect(scope.scene.query(Recorder).size).toBe(1);
    expect(log).toEqual(['rec:attach', 'rec:enable', 'rec:disable', 'rec:enable']);
  });

  test('two applications keep separate runtimes; moving a node across them moves its membership', async () => {
    const log: string[] = [];
    const first = await activeScope(new Scene(), createAppStub());
    const second = await activeScope(new Scene(), createAppStub());
    const node = new Container();
    const ticker = node.addComponent(new Ticker(log));

    first.scene.addChild(node);
    frame(first);
    frame(second);

    expect(log).toEqual(['tick:fixed', 'tick:update']);
    expect(ticker.scene).toBe(first.scene);

    second.scene.addChild(node);
    log.length = 0;
    frame(first);
    frame(second);

    expect(log).toEqual(['tick:fixed', 'tick:update']);
    expect(ticker.scene).toBe(second.scene);
    expect(first.scene.query(Ticker).size).toBe(0);
    expect(second.scene.query(Ticker).size).toBe(1);
    expect(runtimeOf(first)).not.toBe(runtimeOf(second));
  });

  test('enabled=false disables without detaching and stays a query member', async () => {
    const log: string[] = [];
    const scope = await activeScope();
    const node = new Container();
    const recorder = node.addComponent(new Recorder(log));

    scope.scene.addChild(node);
    recorder.enabled = false;

    expect(recorder.active).toBe(false);
    expect(recorder.attached).toBe(true);
    expect(scope.scene.query(Recorder).size).toBe(1);

    recorder.enabled = true;
    expect(log).toEqual(['rec:attach', 'rec:enable', 'rec:disable', 'rec:enable']);
  });
});

describe('Behaviour dispatch (CMP-03)', () => {
  test('phase order: scene hook, behaviours, then scene systems; fixed once per step, update once per frame', async () => {
    const log: string[] = [];

    class OrderScene extends Scene {
      public override fixedUpdate(): void {
        log.push('scene:fixed');
      }

      public override update(): void {
        log.push('scene:update');
      }
    }

    const scope = await activeScope(new OrderScene());

    scope.systems.add({
      fixedUpdate: () => {
        log.push('system:fixed');
      },
      update: () => {
        log.push('system:update');
      },
    });
    scope.scene.addChild(holding(new Ticker(log)));
    log.length = 0;

    frame(scope, 2);

    expect(log).toEqual([
      'scene:fixed',
      'tick:fixed',
      'system:fixed',
      'scene:fixed',
      'tick:fixed',
      'system:fixed',
      'scene:update',
      'tick:update',
      'system:update',
    ]);
  });

  test('only overridden hooks are scheduled; plain components never are', async () => {
    const scope = await activeScope();
    const node = new Container();

    node.addComponent(new UpdateOnly());
    node.addComponent(new Tag());
    scope.scene.addChild(node);

    const runtime = runtimeOf(scope) as unknown as { _updateList: unknown[]; _fixedList: unknown[] };

    expect(runtime._updateList).toHaveLength(1);
    expect(runtime._fixedList).toHaveLength(0);
  });

  test('drawing never ticks behaviours, however often it renders', async () => {
    const scope = await activeScope();
    const behaviour = new UpdateOnly();

    scope.scene.addChild(holding(behaviour));
    scope.draw({ render: () => {} } as unknown as RenderingContext);
    scope.draw({ render: () => {} } as unknown as RenderingContext);

    expect(behaviour.updates).toBe(0);
  });

  test('a behaviour of a scene that is only prepared does not tick', async () => {
    const scene = new Scene();
    const behaviour = new UpdateOnly();

    scene.addChild(holding(behaviour));

    const scope = new SceneScope<void>(createAppStub(), scene);

    await scope.prepare(undefined);
    scope._beginFrame();
    scope.update(step);
    scope._endFrame();

    expect(behaviour.updates).toBe(0);
  });

  test('an async update from an untyped override is rejected at runtime', async () => {
    class AsyncBehaviour extends BehaviorComponent {
      public override update(): void {
        return Promise.resolve() as unknown as void;
      }
    }

    const scope = await activeScope();

    scope.scene.addChild(holding(new AsyncBehaviour()));

    expect(() => frame(scope)).toThrow(/AsyncBehaviour\.update\(\)/);
  });

  test('a disabled behaviour stops ticking without leaving its node', async () => {
    const scope = await activeScope();
    const behaviour = new UpdateOnly();

    scope.scene.addChild(holding(behaviour));
    frame(scope);
    behaviour.enabled = false;
    frame(scope);

    expect(behaviour.updates).toBe(1);
    expect(behaviour.attached).toBe(true);
  });
});

describe('Mutation during dispatch (CMP-04)', () => {
  const setup = async (count: number): Promise<{ scope: SceneScope<void>; log: string[]; tickers: Ticker[] }> => {
    const scope = await activeScope();
    const log: string[] = [];
    const tickers: Ticker[] = [];

    for (let i = 0; i < count; i++) {
      const ticker = new Ticker(log, `t${i}`);

      scope.scene.addChild(holding(ticker));
      tickers.push(ticker);
    }

    return { scope, log, tickers };
  };

  const updates = (log: string[]): string[] => log.filter(entry => entry.endsWith(':update'));

  test('a behaviour removing itself is not called again; the rest of the pass runs', async () => {
    const { scope, log, tickers } = await setup(3);

    tickers[0]!.onUpdate = () => tickers[0]!.node.removeComponent(tickers[0]!);
    frame(scope);
    frame(scope);

    expect(updates(log)).toEqual(['t0:update', 't1:update', 't2:update', 't1:update', 't2:update']);
  });

  test('removing the next behaviour skips it in the same pass, without skipping the one after', async () => {
    const { scope, log, tickers } = await setup(3);

    tickers[0]!.onUpdate = () => tickers[1]!.node.removeComponent(tickers[1]!);
    frame(scope);

    expect(updates(log)).toEqual(['t0:update', 't2:update']);
  });

  test('a behaviour added during dispatch first runs on the next frame', async () => {
    const { scope, log, tickers } = await setup(1);
    const late = new Ticker(log, 'late');

    tickers[0]!.onUpdate = () => {
      if (!late.attached) {
        scope.scene.addChild(holding(late));
      }
    };

    frame(scope);
    expect(updates(log)).toEqual(['t0:update']);
    expect(late.active).toBe(true);

    frame(scope);
    expect(updates(log)).toEqual(['t0:update', 't0:update', 'late:update']);
  });

  test('a behaviour disabled during dispatch does not run later in the frame, nor in its fixed phase next frame', async () => {
    const { scope, log, tickers } = await setup(2);

    tickers[0]!.onUpdate = () => {
      tickers[1]!.enabled = false;
    };

    frame(scope);
    log.length = 0;
    frame(scope);

    expect(log).toEqual(['t0:fixed', 't0:update']);
  });

  test('re-enabling during the frame takes effect from the next frame', async () => {
    const { scope, log, tickers } = await setup(2);

    tickers[0]!.onUpdate = () => {
      tickers[0]!.onUpdate = null;
      tickers[1]!.enabled = false;
      tickers[1]!.enabled = true;
    };

    frame(scope);
    expect(updates(log)).toEqual(['t0:update']);

    frame(scope);
    expect(updates(log)).toEqual(['t0:update', 't0:update', 't1:update']);
  });

  test('a node destroyed during dispatch drops its behaviour at once', async () => {
    const { scope, log, tickers } = await setup(3);

    tickers[0]!.onUpdate = () => {
      if (!tickers[1]!.destroyed) {
        tickers[1]!.node.destroy();
      }
    };

    frame(scope);
    frame(scope);

    expect(updates(log)).toEqual(['t0:update', 't2:update', 't0:update', 't2:update']);
    expect(scope.scene.query(Ticker).size).toBe(2);
  });

  test('reparenting within the scene during dispatch keeps the behaviour, ticking once per frame', async () => {
    const { scope, log, tickers } = await setup(2);
    const holder = new Container();

    scope.scene.addChild(holder);

    tickers[0]!.onUpdate = () => {
      if (tickers[1]!.node.parent !== holder) {
        holder.addChild(tickers[1]!.node as unknown as Container);
      }
    };

    frame(scope);
    frame(scope);

    expect(updates(log)).toEqual(['t0:update', 't0:update', 't1:update']);
    expect(scope.scene.query(Ticker).size).toBe(2);
  });

  test('pausing from a behaviour stops the rest of the pass', async () => {
    const { scope, log, tickers } = await setup(2);

    tickers[0]!.onUpdate = () => scope.pause();
    frame(scope);

    expect(updates(log)).toEqual(['t0:update']);
  });

  test('a throwing update stops the pass and is rethrown; later frames run normally', async () => {
    const { scope, log, tickers } = await setup(2);
    let failures = 1;

    tickers[0]!.onUpdate = () => {
      if (failures-- > 0) {
        throw new Error('update failed');
      }
    };

    expect(() => frame(scope)).toThrow('update failed');
    frame(scope);

    expect(updates(log)).toEqual(['t0:update', 't0:update', 't1:update']);
  });

  test('a throwing onDisable never stops the teardown of the others', async () => {
    const log: string[] = [];

    class FaultyDisable extends Component {
      protected override onDisable(): void {
        throw new Error('disable failed');
      }
    }

    const app = createAppStub();
    const errors: Error[] = [];

    app.onError.add(error => errors.push(error));

    const scope = await activeScope(new Scene(), app);

    scope.scene.addChild(holding(new FaultyDisable()));
    scope.scene.addChild(holding(new Recorder(log)));

    await scope.destroy();

    expect(errors.map(error => error.message)).toContain('disable failed');
    expect(log).toEqual(['rec:attach', 'rec:enable', 'rec:disable', 'rec:detach', 'rec:destroy']);
  });

  test('a throwing onDestroy neither stops sibling teardown nor the parent', () => {
    const log: string[] = [];

    class FaultyDestroy extends Component {
      protected override onDestroy(): void {
        throw new Error('destroy failed');
      }
    }

    const parent = new Container();
    const first = holding(new FaultyDestroy());
    const second = holding(new Recorder(log));

    parent.addChild(first, second);

    expect(() => parent.destroy()).toThrow('destroy failed');
    expect([first.destroyed, second.destroyed, parent.destroyed]).toEqual([true, true, true]);
    expect(log).toEqual(['rec:attach', 'rec:detach', 'rec:destroy']);
  });

  test('a scope suspended mid-frame applies what its frame buffered', async () => {
    const scope = await activeScope();
    const query = scope.scene.query(Tag);

    scope._beginFrame();
    scope.scene.addChild(holding(new Tag()));
    scope.suspend();

    expect(query.size).toBe(1);
  });

  test('a hook that triggers another component hook runs it after it returns', async () => {
    const log: string[] = [];
    const scope = await activeScope();
    const other = new Container();
    const recorder = other.addComponent(new Recorder(log, 'other'));

    class Toggler extends Component {
      protected override onEnable(): void {
        log.push('toggler:enable:start');
        recorder.enabled = false;
        log.push('toggler:enable:end');
      }
    }

    scope.scene.addChild(other);
    scope.scene.addChild(holding(new Toggler()));

    expect(log).toEqual(['other:attach', 'other:enable', 'toggler:enable:start', 'toggler:enable:end', 'other:disable']);
  });
});

describe('Scene.query (CMP-05)', () => {
  test('rows are [node, ...components] in query order, only for nodes carrying every class', async () => {
    const scope = await activeScope();
    const both = new Container();
    const healthOnly = new Container();
    const health = both.addComponent(new Health());
    const armor = both.addComponent(new Armor());

    healthOnly.addComponent(new Health());
    scope.scene.root.addChild(both, healthOnly);

    expect([...scope.scene.query(Armor, Health)]).toEqual([[both, armor, health]]);
  });

  test('the same class tuple returns the same cached query; another order is another query', async () => {
    const scope = await activeScope();

    expect(scope.scene.query(Health, Armor)).toBe(scope.scene.query(Health, Armor));
    expect(scope.scene.query(Armor, Health)).not.toBe(scope.scene.query(Health, Armor));
  });

  test('exact class matching: subclass instances do not match the base class', async () => {
    const scope = await activeScope();

    scope.scene.addChild(holding(new BossHealth()));

    expect(scope.scene.query(Health).size).toBe(0);
    expect(scope.scene.query(BossHealth).size).toBe(1);
  });

  test('disabled and paused members match; removed and destroyed do not', async () => {
    const scope = await activeScope();
    const nodes = [new Container(), new Container(), new Container(), new Container()];
    const tags = nodes.map(node => node.addComponent(new Tag()));

    scope.scene.root.addChild(...nodes);
    tags[0]!.enabled = false;
    scope.pause();
    nodes[1]!.removeComponent(Tag);
    tags[2]!.destroy();

    expect([...scope.scene.query(Tag)].map(([node]) => node)).toEqual([nodes[0], nodes[3]]);
  });

  test('iteration is driven by the smallest index, never by the scene graph', async () => {
    const scope = await activeScope();

    for (let i = 0; i < 50; i++) {
      const node = new Container();

      node.addComponent(new Tag());

      if (i % 10 === 0) {
        node.addComponent(new Armor());
      }

      scope.scene.addChild(node);
    }

    const rare = new Set(runtimeOf(scope).nodesOf(Armor));
    const lookups = vi.spyOn(SceneNode.prototype, '_componentOf');
    const visited: SceneNode[] = [];

    scope.scene.query(Tag, Armor).forEach(node => visited.push(node));

    expect(visited).toHaveLength(5);
    expect(new Set(visited)).toEqual(rare);
    // Two lookups per candidate of the rarest class, none for the other 45 nodes.
    expect(lookups).toHaveBeenCalledTimes(10);
    lookups.mockRestore();
  });

  test('forEach passes the components as arguments', async () => {
    const scope = await activeScope();
    const node = new Container();
    const health = node.addComponent(new Health());
    const armor = node.addComponent(new Armor());
    const tag = node.addComponent(new Tag());
    const calls: unknown[][] = [];

    scope.scene.addChild(node);
    scope.scene.query(Health, Armor, Tag).forEach((...args) => calls.push(args));

    expect(calls).toEqual([[node, health, armor, tag]]);
  });

  test('nested iterations are independent', async () => {
    const scope = await activeScope();
    const nodes = [new Container(), new Container(), new Container()];

    nodes.forEach(node => node.addComponent(new Tag()));
    scope.scene.root.addChild(...nodes);

    const query = scope.scene.query(Tag);
    let pairs = 0;

    for (const [a] of query) {
      for (const [b] of query) {
        if (a !== b) {
          pairs++;
        }
      }
    }

    expect(pairs).toBe(6);
  });

  test('an iteration skips members added and members removed while it runs', async () => {
    const scope = await activeScope();
    const nodes = [new Container(), new Container(), new Container()];

    nodes.forEach(node => node.addComponent(new Tag()));
    scope.scene.root.addChild(...nodes);

    const visited: SceneNode[] = [];

    for (const [node] of scope.scene.query(Tag)) {
      visited.push(node);

      if (node === nodes[0]) {
        nodes[1]!.removeComponent(Tag);
        scope.scene.addChild(holding(new Tag()));
      }
    }

    expect(visited).toEqual([nodes[0], nodes[2]]);
    expect(scope.scene.query(Tag).size).toBe(3);
  });

  test('members joining during a frame become visible after the frame boundary', async () => {
    const scope = await activeScope();
    const query = scope.scene.query(Tag);

    scope._beginFrame();
    scope.scene.addChild(holding(new Tag()));
    expect(query.size).toBe(0);
    scope._endFrame();

    expect(query.size).toBe(1);
  });

  test('a for...of iteration resumed after the frame boundary throws', async () => {
    const scope = await activeScope();

    scope.scene.root.addChild(holding(new Tag()), holding(new Tag()));
    scope._beginFrame();

    const iterator = scope.scene.query(Tag)[Symbol.iterator]();

    iterator.next();
    scope._endFrame();

    expect(() => iterator.next()).toThrow(/frame boundary/);
  });

  test('querying before attachment, without classes, or after the scene ended throws', async () => {
    expect(() => new Scene().query(Tag)).toThrow(/unavailable/);

    const scope = await activeScope();
    const query = scope.scene.query(Tag);

    expect(() => (scope.scene.query as (...types: unknown[]) => unknown)()).toThrow(/at least one/);

    await scope.destroy();

    expect(() => query.size).toThrow(/has ended/);
  });
});

describe('Systems over queries (CMP-06)', () => {
  class Velocity extends Component {
    public constructor(public readonly speed: number) {
      super();
    }
  }

  test('a system holding a query processes its rows in its usual phase and order', async () => {
    const log: string[] = [];

    class MovementSystem {
      public readonly order = 10;

      public constructor(private readonly _movers: ComponentQuery<readonly [typeof Velocity]>) {}

      public update(delta: Seconds): void {
        for (const [node, velocity] of this._movers) {
          node.x += velocity.speed * delta;
        }

        log.push('movement');
      }
    }

    class GameScene extends Scene {
      public override init(): void {
        this.systems.add(new MovementSystem(this.query(Velocity)));
        this.systems.add({
          order: 20,
          update: () => {
            log.push('after');
          },
        });
        this.systems.add({
          order: 0,
          update: () => {
            log.push('before');
          },
        });
      }
    }

    const scene = new GameScene();
    const mover = new Container();

    mover.addComponent(new Velocity(60));
    scene.addChild(mover);

    const scope = await activeScope(scene);

    frame(scope);

    expect(log).toEqual(['before', 'movement', 'after']);
    expect(mover.x).toBeCloseTo(1);
  });
});
