import { BehaviorComponent, Color, Component, type ComponentQuery, Container, Graphics, Scene, type Seconds, Sprite } from '@codexo/exojs';

// #region guide:state
class Health extends Component {
  public current: number;

  public constructor(public readonly max: number) {
    super();
    this.current = max;
  }

  public damage(amount: number): void {
    this.current = Math.max(0, this.current - amount);
  }
}
// #endregion guide:state

// #region guide:behavior
class Spin extends BehaviorComponent<Sprite> {
  public constructor(public speed: number) {
    super();
  }

  public override update(delta: Seconds): void {
    this.node.rotate(this.speed * delta);
  }
}
// #endregion guide:behavior

// #region guide:lifecycle
class Highlight extends Component<Container> {
  private readonly ring = new Graphics();

  protected override onEnable(): void {
    this.ring.clear();
    this.ring.lineWidth = 2;
    this.ring.lineColor = Color.yellow;
    this.ring.drawCircle(0, 0, 40);
    this.node.addChild(this.ring);
  }

  protected override onDisable(): void {
    this.node.removeChild(this.ring);
  }

  protected override onDestroy(): void {
    this.ring.destroy();
  }
}
// #endregion guide:lifecycle

// #region guide:query-system
class Velocity extends Component {
  public constructor(
    public x: number,
    public y: number,
  ) {
    super();
  }
}

class MovementSystem {
  public constructor(private readonly movers: ComponentQuery<readonly [typeof Velocity]>) {}

  public update(delta: Seconds): void {
    this.movers.forEach((node, velocity) => {
      node.x += velocity.x * delta;
      node.y += velocity.y * delta;
    });
  }
}
// #endregion guide:query-system

// #region guide:scene
class ArenaScene extends Scene {
  private readonly heroHealth = new Health(100);
  private readonly hero = new Container();

  public override init(): void {
    const body = new Sprite(this.loader.get('hero.png'));

    body.addComponent(new Spin(90));
    this.hero.addChild(body);
    this.hero.addComponent(this.heroHealth);
    this.hero.addComponent(new Velocity(40, 0));
    this.hero.addComponent(new Highlight());
    this.addChild(this.hero);

    this.systems.add(new MovementSystem(this.query(Velocity)));
  }

  public override update(): void {
    if (this.heroHealth.current < this.heroHealth.max / 4) {
      this.hero.getComponent(Highlight)?.destroy();
    }

    for (const [node, health] of this.query(Health)) {
      if (health.current === 0) {
        node.destroy();
      }
    }
  }
}
// #endregion guide:scene

export { ArenaScene };
