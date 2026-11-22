import { Application, Component, Container, Prefab, Scene } from '@codexo/exojs';

// #region guide:component-data
class Health extends Component {
  public constructor(public current = 100) {
    super();
  }
}

interface HealthDocument {
  readonly current: number;
}
// #endregion guide:component-data

class SaveScene extends Scene {
  override init(): void {
    const actor = new Container();

    actor.addComponent(new Health(75));
    this.root.addChild(actor);

    // #region guide:component-roundtrip
    const prefab = Prefab.from(actor, this.app.loader, this.app.serializers);
    const copy = prefab.instantiate(this.app.loader, this.app.serializers);

    if (!(copy instanceof Container)) {
      copy.destroy();

      throw new TypeError('This prefab must restore a Container.');
    }

    this.root.addChild(copy.setPosition(64, 0));
    console.log(copy.getComponent(Health)?.current); // 75, on an independent component
    // #endregion guide:component-roundtrip
  }
}

const app = new Application({
  scenes: { SaveScene },
  canvas: { width: 800, height: 450, mount: document.body, tabIndex: 0 },
});

// #region guide:component-registration
app.serializers.components.register(Health, {
  type: 'game.health',
  version: 1,
  parser: {
    parse(input: unknown): HealthDocument {
      if (
        typeof input !== 'object' ||
        input === null ||
        !('current' in input) ||
        typeof input.current !== 'number' ||
        !Number.isFinite(input.current)
      ) {
        throw new TypeError('Health data needs a finite current value.');
      }

      return { current: input.current };
    },
  },
  create: document => new Health(document.current),
  serializer: { serialize: health => ({ current: health.current }) },
});
// #endregion guide:component-registration

await app.start(SaveScene);
