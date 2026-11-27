import { Component } from '#core/Component';
import { Scene } from '#core/scene/Scene';
import { Prefab } from '#core/serialization/Prefab';
import { defaultSerializationRegistry, SerializationRegistry } from '#core/serialization/SerializationRegistry';
import { _resetDefaultSerializers, deserializeInto, deserializeSceneInto, serializeSceneTrees } from '#core/serialization/serialize';
import { Container } from '#rendering/Container';
import { UIRoot } from '#ui/UIRoot';

class Peer extends Component {
  public linkedAtAttach = false;
  public peer: Peer | undefined;

  public constructor(public readonly power: number) {
    super();
  }

  protected override onAttach(): void {
    if (this.power < 0) {
      throw new RangeError('A peer cannot attach with negative power.');
    }

    this.linkedAtAttach = this.peer?.peer === this;
  }
}

interface PeerDocument {
  readonly power: number;
  readonly peer?: unknown;
}

const registerPeer = (registry: SerializationRegistry, created: Peer[]): void => {
  registry.components.register(Peer, {
    type: 'peer',
    version: 2,
    migrations: [
      { from: 1, to: 2, migrate: (old: { points: number; peer?: unknown }): PeerDocument => ({ power: old.points, peer: old.peer }) },
    ],
    parser: {
      parse(input: unknown): PeerDocument {
        if (typeof input !== 'object' || input === null || !('power' in input) || typeof input.power !== 'number') {
          throw new TypeError('Expected a peer power.');
        }

        return 'peer' in input ? { power: input.power, peer: input.peer } : { power: input.power };
      },
    },
    create(document: PeerDocument, context) {
      const value = new Peer(document.power);
      created.push(value);

      if (document.peer !== undefined) {
        context.link(document.peer, Peer, target => {
          value.peer = target;
        });
      }

      return value;
    },
    serializer: {
      serialize(value, context): PeerDocument {
        return { power: value.power, ...(value.peer !== undefined && { peer: context.local(value.peer) }) };
      },
    },
  });
};

const oldPeerGraph = (lastRef = 1, lastPower = 4): unknown => ({
  version: 4,
  root: {
    type: 'Container',
    children: [
      { type: 'Container', components: [{ $type: 'peer', $version: 1, $id: 1, points: 3, peer: { $ref: 2 } }] },
      { type: 'Container', components: [{ $type: 'peer', $version: 1, $id: 2, points: lastPower, peer: { $ref: lastRef } }] },
    ],
  },
});

describe('registered component documents', () => {
  test('a prefab migrates component bodies, links peers and only then attaches them', () => {
    const registry = new SerializationRegistry(defaultSerializationRegistry);
    const created: Peer[] = [];
    registerPeer(registry, created);

    const prefab = Prefab.fromJSON(oldPeerGraph());
    const root = prefab.instantiate(null, registry) as Container;
    const first = root.children[0]?.getComponent(Peer);
    const second = root.children[1]?.getComponent(Peer);
    expect(first?.power).toBe(3);
    expect(second?.power).toBe(4);
    expect(first?.peer).toBe(second);
    expect(second?.peer).toBe(first);
    expect(created.every(component => component.linkedAtAttach)).toBe(true);

    const stored = Prefab.from(root, null, registry).toJSON();
    expect(stored.root.children).toMatchObject([
      { components: [{ $type: 'peer', $version: 2, $id: 2, power: 3, peer: { $ref: 1 } }] },
      { components: [{ $type: 'peer', $version: 2, $id: 1, power: 4, peer: { $ref: 2 } }] },
    ]);
    expect(() => Prefab.fromJSON(stored).instantiate()).toThrow(/component type "peer"/i);

    root.destroy();
    expect(created.every(component => component.destroyed)).toBe(true);
  });

  test('a bad link destroys every provisional component and leaves existing children attached', () => {
    const registry = new SerializationRegistry(defaultSerializationRegistry);
    const created: Peer[] = [];
    registerPeer(registry, created);

    const existing = new Container();
    const child = new Container();
    existing.addChild(child);
    const frame = Prefab.fromJSON(oldPeerGraph(9)).toJSON();

    expect(() => deserializeInto(existing, frame.root, null, registry)).toThrow(/points at nothing/);
    expect(existing.children).toEqual([child]);
    expect(child.destroyed).toBe(false);
    expect(created).toHaveLength(2);
    expect(created.every(component => component.destroyed && !component.linkedAtAttach)).toBe(true);

    existing.destroy();
  });

  test('an attach failure rolls back already attached and still-detached components', () => {
    const registry = new SerializationRegistry(defaultSerializationRegistry);
    const created: Peer[] = [];
    registerPeer(registry, created);
    const existing = new Container();
    const child = new Container();
    existing.addChild(child);

    const frame = Prefab.fromJSON(oldPeerGraph(1, -1)).toJSON();
    expect(() => deserializeInto(existing, frame.root, null, registry)).toThrow('A peer cannot attach with negative power.');
    expect(existing.children).toEqual([child]);
    expect(child.destroyed).toBe(false);
    expect(created[0]?.linkedAtAttach).toBe(true);
    expect(created[1]?.linkedAtAttach).toBe(false);
    expect(created.every(component => component.destroyed && !component.attached)).toBe(true);
    existing.destroy();
  });

  test('scene root and overlay descendants share identities without allocating UI on failed reads', () => {
    const registry = new SerializationRegistry(defaultSerializationRegistry);
    registerPeer(registry, []);
    const root = new Container();
    const ui = new Container();
    const leftHost = new Container();
    const rightHost = new Container();
    root.addChild(leftHost);
    ui.addChild(rightHost);
    const left = leftHost.addComponent(new Peer(3));
    const right = rightHost.addComponent(new Peer(5));
    left.peer = right;
    right.peer = left;

    const data = serializeSceneTrees(root, ui, null, registry);
    const nextRoot = new Container();
    const nextUi = new Container();
    const allocateUi = vi.fn(() => nextUi);
    const bad = { ...data, ui: { type: 'Container' } };

    expect(() => deserializeSceneInto(nextRoot, allocateUi, bad, null, registry)).toThrow(/points at nothing/);
    expect(allocateUi).not.toHaveBeenCalled();

    deserializeSceneInto(nextRoot, allocateUi, data, null, registry);

    const nextLeft = nextRoot.children[0]?.getComponent(Peer);
    const nextRight = nextUi.children[0]?.getComponent(Peer);
    expect(nextLeft?.peer).toBe(nextRight);
    expect(nextRight?.peer).toBe(nextLeft);
    expect(allocateUi).toHaveBeenCalledOnce();

    root.destroy();
    ui.destroy();
    nextRoot.destroy();
    nextUi.destroy();
  });

  test('validates the component body before running its factory or attaching it', () => {
    const registry = new SerializationRegistry(defaultSerializationRegistry);
    const created: Peer[] = [];
    registerPeer(registry, created);
    const invalid = Prefab.fromJSON({
      version: 4,
      root: { type: 'Container', components: [{ $type: 'peer', $version: 2, power: 'invalid' }] },
    });

    expect(() => invalid.instantiate(null, registry)).toThrow('Expected a peer power.');
    expect(created).toEqual([]);
  });

  test('in-place scene links point to the existing world root, including before attach', () => {
    class WorldLink extends Component {
      public world: Container | undefined;
      public worldAtAttach: Container | undefined;

      public constructor(private readonly _fail = false) {
        super();
      }

      protected override onAttach(): void {
        this.worldAtAttach = this.world;

        if (this._fail) {
          throw new Error('world link attach failed');
        }
      }
    }

    const registry = new SerializationRegistry(defaultSerializationRegistry);
    registry.components.register(WorldLink, {
      type: 'world-link',
      parser: {
        parse(body: unknown): { readonly world: unknown; readonly fail: boolean } {
          if (typeof body !== 'object' || body === null || !('world' in body)) {
            throw new TypeError('Expected a world link.');
          }

          return { world: body.world, fail: 'fail' in body && body.fail === true };
        },
      },
      create(body, context) {
        const component = new WorldLink(body.fail);
        context.link(body.world, Container, world => {
          component.world = world;
        });

        return component;
      },
      serializer: {
        serialize(component, context) {
          return { world: context.local(component.world!), fail: false };
        },
      },
    });

    const source = new Container();
    const sourceChild = new Container();
    source.addChild(sourceChild);
    const link = new WorldLink();
    link.world = source;
    sourceChild.addComponent(link);
    const data = serializeSceneTrees(source, null, null, registry);
    expect(data.root.$id).toBe(1);

    const destination = new Container();
    destination.x = 7;
    const previous = new Container();
    destination.addChild(previous);
    const allocateUi = vi.fn(() => new Container());

    const failing = {
      version: data.version,
      root: {
        type: 'Container',
        x: 77,
        $id: 1,
        children: [{ type: 'Container', components: [{ $type: 'world-link', $version: 1, world: { $ref: 1 }, fail: true }] }],
      },
      ui: { type: 'Container' },
    };

    expect(() => deserializeSceneInto(destination, allocateUi, failing, null, registry)).toThrow('world link attach failed');
    expect(destination.children).toEqual([previous]);
    expect(destination.x).toBe(7);
    expect(allocateUi).not.toHaveBeenCalled();

    deserializeSceneInto(destination, allocateUi, data, null, registry);
    const restored = destination.children[0]?.getComponent(WorldLink);
    expect(restored?.world).toBe(destination);
    expect(restored?.worldAtAttach).toBe(destination);
    expect(allocateUi).not.toHaveBeenCalled();

    previous.destroy();
    destination.destroy();
    source.destroy();
  });

  test('Scene round-trips world and UI anchor identity and publishes new UI only after a successful read', () => {
    let readingScene: Scene | undefined;

    class AnchorLink extends Component {
      public world?: Container;
      public ui?: UIRoot;
      public atAttach?: readonly [Container | undefined, UIRoot | undefined];

      public constructor(private readonly _fail = false) {
        super();
      }

      protected override onAttach(): void {
        this.atAttach = [this.world, this.ui];
        expect(this.ui).toBe(readingScene?.ui ?? this.ui);

        if (this._fail) {
          throw new Error('anchor link attach failed');
        }
      }
    }

    const created: AnchorLink[] = [];
    defaultSerializationRegistry.components.register(AnchorLink, {
      type: 'scene-anchor-link',
      parser: {
        parse(body: unknown): { readonly world: unknown; readonly ui: unknown; readonly fail: boolean } {
          if (typeof body !== 'object' || body === null || !('world' in body) || !('ui' in body)) {
            throw new TypeError('Expected both scene anchors.');
          }

          return { world: body.world, ui: body.ui, fail: 'fail' in body && body.fail === true };
        },
      },
      create(body, context) {
        const value = new AnchorLink(body.fail);
        created.push(value);
        context.link(body.world, Container, world => {
          value.world = world;
        });
        context.link(body.ui, UIRoot, ui => {
          value.ui = ui;
        });

        return value;
      },
      serializer: {
        serialize(value, context) {
          return { world: context.local(value.world!), ui: context.local(value.ui!), fail: false };
        },
      },
    });

    const source = new Scene();
    const fresh = new Scene();
    const existing = new Scene();
    const existingUi = existing.ui;
    const oldUiChild = new Container();
    const oldWorldChild = new Container();
    existingUi.addChild(oldUiChild);
    existingUi.x = 7;
    existing.root.addChild(oldWorldChild);

    try {
      for (const anchor of [source.root, source.ui]) {
        const child = new Container();
        anchor.addChild(child);
        const link = new AnchorLink();
        link.world = source.root;
        link.ui = source.ui;
        child.addComponent(link);
      }

      const data = source.serialize();
      expect(data.root.$id).toBeDefined();
      expect(data.ui?.$id).toBeDefined();
      const ui = data.ui!;
      const failingData = (body: object) => ({
        ...data,
        ui: {
          ...ui,
          x: 77,
          children: [{ type: 'Container', components: [{ $type: 'scene-anchor-link', $version: 1, ...body }] }],
        },
      });

      for (const [invalid, message] of [
        [failingData({}), 'Expected both scene anchors.'],
        [failingData({ world: { $ref: data.root.$id }, ui: { $ref: 100 } }), 'points at nothing'],
        [failingData({ world: { $ref: data.root.$id }, ui: { $ref: ui.$id }, fail: true }), 'anchor link attach failed'],
      ] as const) {
        readingScene = fresh;
        expect(() => fresh.deserialize(invalid)).toThrow(message);
        expect(fresh._peekUI()).toBeNull();
        readingScene = existing;
        expect(() => existing.deserialize(invalid)).toThrow(message);
        expect(existing._peekUI()).toBe(existingUi);
        expect(existing.root.children).toEqual([oldWorldChild]);
        expect(existingUi.children).toEqual([oldUiChild]);
        expect(existingUi.x).toBe(7);
      }

      expect(created.some(link => link.ui?.destroyed === true)).toBe(true);

      for (const scene of [fresh, existing]) {
        readingScene = scene;
        scene.deserialize(JSON.parse(JSON.stringify(data)) as typeof data);
        const restoredUi = scene._peekUI();
        expect(restoredUi).not.toBeNull();

        for (const anchor of [scene.root, restoredUi!]) {
          const link = anchor.children[0]?.getComponent(AnchorLink);
          expect(link?.world).toBe(scene.root);
          expect(link?.ui).toBe(restoredUi);
          expect(link?.atAttach?.[0]).toBe(scene.root);
          expect(link?.atAttach?.[1]).toBe(restoredUi);
        }
      }

      expect(existing._peekUI()).toBe(existingUi);
    } finally {
      oldUiChild.destroy();
      oldWorldChild.destroy();
      existing.destroy();
      fresh.destroy();
      source.destroy();
      _resetDefaultSerializers();
    }
  });
});
