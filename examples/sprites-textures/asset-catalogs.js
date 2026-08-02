// Auto-generated from asset-catalogs.ts — edit the .ts source, not this file.
import { Application, Asset, Assets, Color, Graphics, Keyboard, Scene, Sprite, Text } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
// #region guide:catalog-declare
// A catalog is a named, typed group of assets. A bare path infers its type from
// the file extension; anything else takes an explicit `Asset.type(...)`.
const SharedAssets = Assets.from({
    logo: 'image/uv-grid-256.png',
    click: Asset.type('sound', 'audio/ui-click.ogg'),
    atlas: Asset.type('json', 'json/buttons.json'),
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
// ones are added. The base is never mutated — `LevelLocalAssets.ground` keeps
// pointing at its own texture.
const NightAssets = Assets.extend(LevelLocalAssets, {
    ground: 'image/particle-light.png', // deliberate override
    star: 'image/buttons.png', // new key
});
// #endregion guide:catalog-extend
class AssetCatalogsScene extends Scene {
    logo;
    ship;
    ground;
    summary;
    bar;
    hud;
    dayGround;
    nightGround;
    theme;
    progress = 0;
    frameCount = 0;
    loadError = '';
    night = false;
    barX = 0;
    barY = 0;
    barWidth = 0;
    async load() {
        // #region guide:queue-progress
        // Every `load(...)` call returns a LoadingQueue. It is `PromiseLike`, so
        // it can be awaited directly, and it reports the progress of this one
        // queue through `onProgress`.
        const loading = this.loader.load(LevelAssets);
        loading.onProgress.add(progress => {
            this.progress = progress.loaded / progress.total;
        });
        // #endregion guide:queue-progress
        // #region guide:catalog-parallel
        // Independent catalogs get independent queues — start both, await both.
        // The result tuple keeps each catalog's shape.
        const [day, night] = await Promise.all([loading, this.loader.load(NightAssets)]);
        this.dayGround = day.ground;
        this.nightGround = night.ground;
        // #endregion guide:catalog-parallel
        // #region guide:non-leaf-load
        // Non-leaf types (`music`, `video`, `bmFont`, `font`, …) have no
        // bare-path form and no placeholder to hand back, even for a literal
        // path — they are always loaded by reference and awaited.
        this.theme = await this.loader.load(Asset.type('music', 'audio/demo-loop-main.ogg'));
        // #endregion guide:non-leaf-load
        // #region guide:catalog-failure
        // Awaiting a catalog rejects if any leaf fails. Every leaf still carries
        // its own status, so the scene can name the one that broke and keep
        // running — a failed seamless handle renders a visible "missing" texture.
        try {
            await this.loader.load(SharedAssets);
        }
        catch {
            if (SharedAssets.logo.state === 'failed') {
                this.loadError = `logo failed: ${SharedAssets.logo.error?.message ?? 'unknown error'}`;
            }
        }
        // #endregion guide:catalog-failure
    }
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        // A catalog's properties are the same objects that existed before the
        // load — now populated. There is no separate `get()` step.
        this.logo = new Sprite(LevelAssets.logo);
        this.ship = new Sprite(LevelAssets.ship);
        this.ground = new Sprite(LevelAssets.ground);
        // A value entry resolves to an AssetRef — read `.value` once `.ready`.
        this.frameCount = Object.keys(LevelAssets.atlas.value.frames).length;
        this.logo.setAnchor(0.5).setPosition(width * 0.25, height * 0.55).setScale(0.9);
        this.ship.setAnchor(0.5).setPosition(width * 0.5, height * 0.55);
        this.ground.setAnchor(0.5).setPosition(width * 0.75, height * 0.55).setScale(1.4);
        this.barWidth = width * 0.5;
        this.barX = (width - this.barWidth) / 2;
        this.barY = height * 0.16;
        this.bar = new Graphics();
        this.summary = new Text('', { fillColor: Color.white, fontSize: 18, align: 'center' });
        this.summary.setAnchor(0.5, 0).setPosition(width / 2, this.barY + 44);
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
        this.hud = mountControls({
            title: 'Asset Catalogs',
            controls: [
                { keys: 'N', action: 'swap the ground texture for the derived night catalog' },
                { keys: 'G', action: 'load a ground texture by a computed path' },
                { keys: 'M', action: 'play the streamed theme (a non-leaf asset)' },
            ],
            hint: 'Three catalogs — a shared one, a composed one, and one derived with extend — loaded through two parallel queues.',
        });
    }
    // #region guide:dynamic-path
    /** Replaces the ground texture with a variant chosen at runtime. */
    async useVariant(variant) {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        // The path is computed rather than a literal, so its type cannot be
        // inferred from the extension — name it with `Asset.type(...)`.
        const texture = await app.loader.load(Asset.type('texture', `image/${variant}.png`));
        this.ground.setTexture(texture);
    }
    // #endregion guide:dynamic-path
    draw(context) {
        context.backend.clear();
        this.bar.clear();
        this.bar.fillColor = new Color(48, 52, 62);
        this.bar.drawRectangle(this.barX, this.barY, this.barWidth, 22);
        this.bar.fillColor = new Color(110, 200, 255);
        this.bar.drawRectangle(this.barX, this.barY, this.barWidth * this.progress, 22);
        context.render(this.bar);
        const failure = this.loadError === '' ? '' : `\n${this.loadError}`;
        this.summary.text =
            `LevelAssets = compose(SharedAssets, LevelLocalAssets) — ${Object.keys(LevelAssets.entries).length} keys\n` +
                `atlas frames: ${this.frameCount}   ground: ${this.night ? 'night' : 'day'}   queue: ${Math.round(this.progress * 100)}%${failure}`;
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
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});
app.start(AssetCatalogsScene);
