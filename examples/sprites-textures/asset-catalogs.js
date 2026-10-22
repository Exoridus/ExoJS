// Auto-generated from asset-catalogs.ts - edit the .ts source, not this file.
import { Application, Asset, Assets, Color, FixedResolutionCanvasSizing, Keyboard, Scene, Sprite, Text } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { mountControls } from '@examples/runtime';
// #region guide:catalog-declare
// A catalog is a named, typed group of assets. Its entries are descriptors -
// here from the demo catalog; in your own project usually a bare path, whose
// file extension infers the type, or an explicit `Asset.type(...)`.
const SharedAssets = Assets.from({
  logo: assets.uvGrid256,
  click: assets.soundUiClick,
  atlas: assets.platformerCharactersAtlas,
});
// #endregion guide:catalog-declare
// #region guide:catalog-compose
// `compose` merges catalogs into one ordinary, fully typed catalog. It SHARES
// its inputs' handles instead of copying them, so `LevelAssets.logo` is the very
// same Texture object as `SharedAssets.logo`.
const LevelLocalAssets = Assets.from({
  ship: assets.ship,
  ground: assets.hueRamp,
});
const LevelAssets = Assets.compose(SharedAssets, LevelLocalAssets);
// #endregion guide:catalog-compose
// #region guide:catalog-extend
// `extend` derives a catalog: listed keys are re-declared deliberately, unknown
// ones are added. The base is never mutated - `LevelLocalAssets.ground` keeps
// pointing at its own texture.
const NightAssets = Assets.extend(LevelLocalAssets, {
  ground: assets.particleLight, // deliberate override
  star: assets.particleStar, // new key
});
// #endregion guide:catalog-extend
class AssetCatalogsScene extends Scene {
  logo;
  ship;
  ground;
  summary;
  hud;
  dayGround;
  nightGround;
  theme;
  frameCount = 0;
  loadError = '';
  night = false;
  async load() {
    this.hud = mountControls({ status: 'Loading the shared and day catalogs...' });
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
    this.theme = await this.loader.load(assets.musicLoopMain);
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
  init() {
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
      void this.useVariant(assets.hueRamp.source);
    });
  }
  // #region guide:dynamic-path
  /** Replaces the ground texture with a variant chosen at runtime. */
  async useVariant(url) {
    const app = this.app;
    // A URL chosen at runtime has no literal file extension to infer the type
    // from - name it with `Asset.type(...)`.
    const texture = await app.loader.load(Asset.type('texture', url));
    this.ground.setTexture(texture);
  }
  // #endregion guide:dynamic-path
  draw(context) {
    const failure = this.loadError === '' ? '' : `\n${this.loadError}`;
    this.summary.text =
      `LevelAssets = compose(SharedAssets, LevelLocalAssets) — ${Object.keys(LevelAssets.entries).length} keys\n` +
      `atlas frames: ${this.frameCount}   ground: ${this.night ? 'night' : 'day'}   logo: ${SharedAssets.logo.state}${failure}`;
    context.render(this.summary);
    context.render(this.logo);
    context.render(this.ship);
    context.render(this.ground);
  }
  destroy() {
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
});
await app.start(AssetCatalogsScene);
