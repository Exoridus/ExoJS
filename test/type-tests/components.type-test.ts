// Component contracts: host constraint, exact-class lookup without a free
// result generic, remove overloads, typed query rows and synchronous hooks.

import {
  BehaviorComponent,
  Component,
  type ComponentQuery,
  type ComponentQueryRow,
  Container,
  Scene,
  type SceneNode,
  type Seconds,
  type Sprite,
  type SystemContext,
  type SystemRegistry,
} from '@codexo/exojs';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

class Health extends Component {
  public current = 100;
}

class Armor extends Component {
  public value = 5;
}

class Tint extends Component<Sprite> {
  public apply(): void {
    this.node.tint.set(255, 0, 0);
  }
}

class Spin extends BehaviorComponent<Sprite> {
  public override update(delta: Seconds): void {
    this.node.rotate(delta);
  }
}

declare const node: SceneNode;
declare const container: Container;
declare const sprite: Sprite;

// --- add / get / has / remove ---------------------------------------------

const added = node.addComponent(new Health());
type _Added = Expect<Equal<typeof added, Health>>;

const found = node.getComponent(Health);
type _Found = Expect<Equal<typeof found, Health | null>>;

const present: boolean = node.hasComponent(Health);

const removedByClass = node.removeComponent(Armor);
type _RemovedByClass = Expect<Equal<typeof removedByClass, Armor | null>>;

const removedByInstance = node.removeComponent(added);
type _RemovedByInstance = Expect<Equal<typeof removedByInstance, Health | null>>;

const all: readonly Component[] = node.components;

// @ts-expect-error - no free result generic: the class is the only source of the type.
node.getComponent<Armor>(Health);

// @ts-expect-error - a lookup token must be a component class.
node.getComponent(Container);

// --- host constraint --------------------------------------------------------

sprite.addComponent(new Tint());
sprite.addComponent(new Spin());
sprite.addComponent(new Health());

// @ts-expect-error - a Component<Sprite> cannot be attached to a plain container.
container.addComponent(new Tint());

// @ts-expect-error - nor to the SceneNode base.
node.addComponent(new Spin());

const tint = sprite.addComponent(new Tint());
type _TintNode = Expect<Equal<typeof tint.node, Sprite>>;

// @ts-expect-error - only components can be attached.
node.addComponent({ attached: true });

// --- synchronous hooks ------------------------------------------------------

class AsyncUpdate extends BehaviorComponent {
  // @ts-expect-error - behaviour hooks must be synchronous.
  public override async update(): Promise<void> {}
}

class AsyncEnable extends Component {
  // @ts-expect-error - lifecycle hooks must be synchronous.
  protected override async onEnable(): Promise<void> {}
}

// --- query --------------------------------------------------------------------

class QueryScene extends Scene {
  public readonly movers: ComponentQuery<readonly [typeof Health, typeof Armor]> = this.query(Health, Armor);

  public override update(): void {
    for (const row of this.movers) {
      type _Row = Expect<Equal<typeof row, ComponentQueryRow<readonly [typeof Health, typeof Armor]>>>;

      const [owner, health, armor] = row;
      type _Owner = Expect<Equal<typeof owner, SceneNode>>;
      type _Health = Expect<Equal<typeof health, Health>>;
      type _Armor = Expect<Equal<typeof armor, Armor>>;
    }

    this.query(Armor, Health).forEach((owner, armor, health) => {
      type _Args = Expect<Equal<[typeof owner, typeof armor, typeof health], [SceneNode, Armor, Health]>>;
    });

    // @ts-expect-error - a query needs at least one class.
    this.query();

    // @ts-expect-error - only component classes can be queried.
    this.query(Health, Container);

    // Derived queries keep the row type.
    const narrowed = this.movers
      .active()
      .enabled()
      .without(Tint)
      .where((_owner, health, armor) => health.current > armor.value);
    type _Narrowed = Expect<Equal<typeof narrowed, ComponentQuery<readonly [typeof Health, typeof Armor]>>>;

    // @ts-expect-error - a where() predicate answers with a boolean.
    this.movers.where(() => 'yes');

    this.movers.changed(Health);

    // @ts-expect-error - changed() narrows to classes the query has.
    this.movers.changed(Tint);
  }
}

class SystemOnly {
  public update(): void {}
}

declare const registry: SystemRegistry;

const one = registry.find(SystemOnly);
type _One = Expect<Equal<typeof one, SystemOnly | null>>;

const many = registry.findAll(SystemOnly);
type _Many = Expect<Equal<typeof many, SystemOnly[]>>;

registry.add({
  update(): void {},
  onAttach(context: SystemContext): void {
    const scene: Scene | null = context.scene;
    const systems: SystemRegistry = context.systems;

    void scene;
    void systems;
  },
});

registry.add({
  update(): void {},
  // @ts-expect-error - system lifecycle hooks must be synchronous.
  async onEnable(): Promise<void> {},
});

export { all, AsyncEnable, AsyncUpdate, present, QueryScene };
