import {
  Application,
  Asset,
  Assets,
  type AudioStream,
  Color,
  FixedResolutionCanvasSizing,
  Keyboard,
  type RenderingContext,
  Scene,
  Sprite,
  Text,
  type Texture,
} from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

// #region guide:catalog-declare
// A catalog is a named, typed group of assets. A bare path infers its type from
// the file extension; anything else takes an explicit `Asset.type(...)`.
const SharedAssets = Assets.from({
  logo: 'image/uv-grid-256.png',
  click: Asset.type('sound', 'audio/ui-click.ogg'),
  atlas: Asset.type<{ frames: Record<string, unknown> }>('json', 'json/buttons.json'),
});
// #endregion guide:catalog-declare

// #region guide:catalog-compose
// `compose` merges catalogs into one ordinary, fully typed catalog. It SHARES
// its inputs' handles instead of copying them, so `LevelAssets.logo` is the very
// same Texture object as `SharedAssets.logo`.
const LevelLocalAssets = Assets.from({
  ship: 'image/ship-a.png',
  ground: 'image/hue-ramp.png',
});

const LevelAssets = Assets.compose(SharedAssets, LevelLocalAssets);
// #endregion guide:catalog-compose

// #region guide:catalog-extend
// `extend` derives a catalog: listed keys are re-declared deliberately, unknown
// ones are added. The base is never mutated - `LevelLocalAssets.ground` keeps
// pointing at its own texture.
const NightAssets = Assets.extend(LevelLocalAssets, {
  ground: 'image/particle-light.png', // deliberate override
  star: 'image/buttons.png', // new key
});
// #endregion guide:catalog-extend

class AssetCatalogsScene extends Scene {
  private logo!: Sprite;
  private ship!: Sprite;
  private ground!: Sprite;
  private summary!: Text;
  private hud!: ReturnType<typeof mountControls>;

  private dayGround!: Texture;
  private nightGround!: Texture;
  private theme!: AudioStream;

  private frameCount = 0;
  private loadError = '';
  private night = false;
  override async load(): Promise<void> {
    this.hud = mountControls({
      title: 'Asset Catalogs',
      controls: [
        { keys: 'N', action: 'swap the ground texture for the derived night catalog' },
        { keys: 'G', action: 'load a ground texture by a computed path' },
        { keys: 'M', action: 'play the streamed theme (a non-leaf asset)' },
      ],
      status: 'Loading the shared and day catalogs...',
      hint: 'Catalog handles expose their queue and cache state while loading.',
    });
    // #region guide:queue-progress
    // Every `load(...)` call returns a LoadingQueue. It is `PromiseLike`, so
    // it can be awaited directly, and it reports the progress of this one
    // queue through `onProgress`.
    const loading = this.loader.load(LevelAssets);

    loading.onProgress.add(progress => {
      this.hud.setStatus(`Day catalog: ${progress.loaded}/${progress.total} loaded; logo ${SharedAssets.logo.state}.`);
    });
    // #endregion guide:queue-progress

    // #region guide:catalog-parallel
    // Independent catalogs get independent queues - start both, await both.
    // The result tuple keeps each catalog's shape.
    const [day, night] = await Promise.all([loading, this.loader.load(NightAssets)]);
    this.hud.setStatus(`Both catalogs ready; logo ${SharedAssets.logo.state}, night ground ${NightAssets.ground.state}.`);

    this.dayGround = day.ground;
    this.nightGround = night.ground;
    // #endregion guide:catalog-parallel

    // #region guide:non-leaf-load
    // Non-leaf types (`music`, `video`, `bmFont`, `font`, ...) have no
    // bare-path form and no placeholder to hand back, even for a literal
    // path - they are always loaded by reference and awaited.
    this.theme = await this.loader.load(Asset.type('music', 'audio/demo-loop-main.ogg'));
    // #endregion guide:non-leaf-load

    // #region guide:catalog-failure
    // Awaiting a catalog rejects if any leaf fails. Every leaf still carries
    // its own status, so the scene can name the one that broke and keep
    // running - a failed seamless handle renders a visible "missing" texture.
    try {
      await this.loader.load(SharedAssets);
    } catch {
      if (SharedAssets.logo.state === 'failed') {
        this.loadError = `logo failed: ${SharedAssets.logo.error?.message ?? 'unknown error'}`;
      }
    }
    // #endregion guide:catalog-failure
  }

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    // A catalog's properties are the same objects that existed before the
    // load - now populated. There is no separate `get()` step.
    this.logo = new Sprite(LevelAssets.logo);
    this.ship = new Sprite(LevelAssets.ship);
    this.ground = new Sprite(LevelAssets.ground);

    // A value entry resolves to an AssetRef - read `.value` once `.ready`.
    this.frameCount = Object.keys(LevelAssets.atlas.value.frames).length;

    this.logo
      .setAnchor(0.5)
      .setPosition(width * 0.25, height * 0.55)
      .setScale(0.9);
    this.ship.setAnchor(0.5).setPosition(width * 0.5, height * 0.55);
    this.ground
      .setAnchor(0.5)
      .setPosition(width * 0.75, height * 0.55)
      .setScale(1.4);

    this.summary = new Text('', { fillColor: Color.white, fontSize: 18, align: 'center' });
    this.summary.setAnchor(0.5, 0).setPosition(width / 2, height * 0.16);

    this.inputs.onTrigger(Keyboard.N, () => {
      this.night = !this.night;
      this.ground.setTexture(this.night ? this.nightGround : this.dayGround);
    });

    this.inputs.onTrigger(Keyboard.M, () => {
      app.audio.play(this.theme, { volume: 0.5 });
    });

    this.inputs.onTrigger(Keyboard.G, () => {
      void this.useVariant('hue-ramp');
    });
  }

  // #region guide:dynamic-path
  /** Replaces the ground texture with a variant chosen at runtime. */
  private async useVariant(variant: string): Promise<void> {
    const app = this.app;

    // The path is computed rather than a literal, so its type cannot be
    // inferred from the extension - name it with `Asset.type(...)`.
    const texture = await app.loader.load(Asset.type('texture', `image/${variant}.png`));

    this.ground.setTexture(texture);
  }
  // #endregion guide:dynamic-path

  override draw(context: RenderingContext): void {
    const failure = this.loadError === '' ? '' : `\n${this.loadError}`;
    this.summary.text =
      `LevelAssets = compose(SharedAssets, LevelLocalAssets) — ${Object.keys(LevelAssets.entries).length} keys\n` +
      `atlas frames: ${this.frameCount}   ground: ${this.night ? 'night' : 'day'}   logo: ${SharedAssets.logo.state}${failure}`;
    context.render(this.summary);

    context.render(this.logo);
    context.render(this.ship);
    context.render(this.ground);
  }

  override destroy(): void {
    this.hud.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { AssetCatalogsScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  loader: {
    basePath: 'assets/',
  },
});

await app.start(AssetCatalogsScene);
