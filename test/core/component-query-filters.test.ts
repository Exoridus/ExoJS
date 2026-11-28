import type { Application } from '#core/Application';
import { Component } from '#core/Component';
import { Scene } from '#core/scene/Scene';
import { SceneScope } from '#core/scene/SceneScope';
import { Signal } from '#core/Signal';
import { seconds } from '#core/units';
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

class Tag extends Component {}

class Health extends Component {
  public current = 100;
}

class Armor extends Component {
  public value = 5;
}

/** Records every lifecycle hook, prefixed with `name`. */

class Invulnerable extends Component {}

const nodesOf = (rows: Iterable<readonly [unknown, ...unknown[]]>): unknown[] => [...rows].map(row => row[0]);

describe('ComponentQuery filters', () => {
  test('active() and enabled() keep only matches whose components all qualify', async () => {
    const scope = await activeScope();
    const on = holding(new Health());
    const off = holding(new Health());

    scope.scene.root.addChild(on, off);
    off.getComponent(Health)!.enabled = false;

    const query = scope.scene.query(Health);

    expect(nodesOf(query)).toEqual([on, off]);
    expect(nodesOf(query.active())).toEqual([on]);
    expect(nodesOf(query.enabled())).toEqual([on]);
    expect(query.active()).toBe(query.active());

    scope.suspend();
    expect(nodesOf(query.active())).toEqual([]);
    expect(nodesOf(query.enabled())).toEqual([on]);
  });

  test('without() excludes nodes carrying any of the classes; equal lists share a query', async () => {
    const scope = await activeScope();
    const plain = holding(new Health());
    const shielded = holding(new Health());

    shielded.addComponent(new Invulnerable());
    scope.scene.root.addChild(plain, shielded);

    const query = scope.scene.query(Health);

    expect(nodesOf(query.without(Invulnerable))).toEqual([plain]);
    expect(query.without(Invulnerable)).toBe(query.without(Invulnerable));
    expect(query.without(Invulnerable).size).toBe(1);
  });

  test('where() filters by a predicate over the row and composes with other filters', async () => {
    const scope = await activeScope();
    const weak = holding(new Health());
    const strong = holding(new Health());
    const armored = holding(new Health());

    weak.getComponent(Health)!.current = 10;
    armored.getComponent(Health)!.current = 10;
    armored.addComponent(new Armor());
    scope.scene.root.addChild(weak, strong, armored);

    const wounded = scope.scene.query(Health).where((_node, health) => health.current < 50);
    const visited: unknown[] = [];

    wounded.without(Armor).forEach(node => visited.push(node));

    expect(nodesOf(wounded)).toEqual([weak, armored]);
    expect(visited).toEqual([weak]);
  });
});

describe('ComponentQuery.changed', () => {
  test('the first pass lists every match; later passes list only marked or joined components', async () => {
    const scope = await activeScope();
    const a = holding(new Health());
    const b = holding(new Health());

    scope.scene.root.addChild(a, b);

    const changes = scope.scene.query(Health).changed();

    expect(nodesOf(changes)).toEqual([a, b]);
    expect(nodesOf(changes)).toEqual([]);

    b.getComponent(Health)!.markChanged();
    expect(nodesOf(changes)).toEqual([b]);
    expect(nodesOf(changes)).toEqual([]);

    const c = holding(new Health());

    scope.scene.addChild(c);
    expect(nodesOf(changes)).toEqual([c]);
  });

  test('observers are independent: one consuming a change leaves it for the other', async () => {
    const scope = await activeScope();
    const node = holding(new Health());

    scope.scene.addChild(node);

    const query = scope.scene.query(Health);
    const first = query.changed();
    const second = query.changed();
    const derived = first.active();

    nodesOf(first);
    nodesOf(second);
    node.getComponent(Health)!.markChanged();

    expect(nodesOf(first)).toEqual([node]);
    expect(nodesOf(second)).toEqual([node]);
    // A query derived from an observer keeps a cursor of its own.
    expect(nodesOf(derived)).toEqual([node]);
    expect(nodesOf(derived)).toEqual([]);
  });

  test('size and an abandoned for...of consume nothing; a change during a pass reaches the next pass', async () => {
    const scope = await activeScope();
    const a = holding(new Health());
    const b = holding(new Health());

    scope.scene.root.addChild(a, b);

    const changes = scope.scene.query(Health).changed();

    expect(changes.size).toBe(2);

    for (const _row of changes) {
      break;
    }

    let marked = false;

    changes.forEach(node => {
      if (!marked) {
        marked = true;
        node.getComponent(Health)!.markChanged();
      }
    });

    expect(marked).toBe(true);
    expect(nodesOf(changes)).toEqual([a]);
  });

  test('changed(...types) counts only the named classes', async () => {
    const scope = await activeScope();
    const node = holding(new Health());

    node.addComponent(new Armor());
    scope.scene.addChild(node);

    const healthChanges = scope.scene.query(Health, Armor).changed(Health);

    nodesOf(healthChanges);
    node.getComponent(Armor)!.markChanged();
    expect(nodesOf(healthChanges)).toEqual([]);

    node.getComponent(Health)!.markChanged();
    expect(nodesOf(healthChanges)).toEqual([node]);
  });

  test('a marked component that moved to another scene is reported once, as a join there', async () => {
    const first = await activeScope();
    const second = await activeScope();
    const node = holding(new Health());

    first.scene.addChild(node);
    node.getComponent(Health)!.markChanged();

    const changes = second.scene.query(Health).changed();

    second.scene.addChild(node);
    frame(second);

    expect(nodesOf(changes)).toEqual([node]);
    expect(nodesOf(changes)).toEqual([]);
  });
});

describe('ComponentQuery change observers under filters', () => {
  test('a change made while a filter excludes the match is consumed; re-entering the selection needs markChanged', async () => {
    const scope = await activeScope();
    const health = new Health();
    const node = holding(health);

    scope.scene.addChild(node);

    const changes = scope.scene.query(Health).changed().enabled();

    expect(nodesOf(changes)).toEqual([node]);

    health.enabled = false;
    health.markChanged();
    expect(nodesOf(changes)).toEqual([]);

    health.enabled = true;
    expect(nodesOf(changes)).toEqual([]);

    health.markChanged();
    expect(nodesOf(changes)).toEqual([node]);
  });

  test('a node entering a where() selection is not reported until it is marked', async () => {
    const scope = await activeScope();
    const health = new Health();
    const node = holding(health);

    scope.scene.addChild(node);

    const wounded = scope.scene
      .query(Health)
      .changed()
      .where((_node, h) => h.current < 50);

    expect(nodesOf(wounded)).toEqual([]);

    health.current = 10;
    expect(nodesOf(wounded)).toEqual([]);

    health.markChanged();
    expect(nodesOf(wounded)).toEqual([node]);
  });

  test('a nested pass on the same observer is not undone when the outer pass completes', async () => {
    const scope = await activeScope();
    const a = holding(new Health());
    const b = holding(new Health());

    scope.scene.root.addChild(a, b);

    const changes = scope.scene.query(Health).changed();

    nodesOf(changes);
    a.getComponent(Health)!.markChanged();

    let inner: unknown[] = [];

    changes.forEach(() => {
      if (inner.length === 0) {
        b.getComponent(Health)!.markChanged();
        inner = nodesOf(changes);
      }
    });

    expect(inner).toEqual([a, b]);
    expect(nodesOf(changes)).toEqual([]);
  });
});
