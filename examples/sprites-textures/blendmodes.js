// Auto-generated from blendmodes.ts — edit the .ts source, not this file.
import { Application, Asset, BlendModes, Color, ScaleModes, Scene, Sprite } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';
const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    // A mid-tone backdrop so darkening modes (Subtract, Multiply, Darken) stay
    // visible instead of compositing into a black canvas.
    clearColor: new Color(48, 54, 68),
});
const ALPHA_RINGS = assets.technical.alpha.alphaGradientRings;
// Every public blend mode, in enum order, paired with a display name.
const BLEND_MODES = [
    { mode: BlendModes.Normal, name: 'Normal' },
    { mode: BlendModes.Additive, name: 'Additive' },
    { mode: BlendModes.Subtract, name: 'Subtract' },
    { mode: BlendModes.Multiply, name: 'Multiply' },
    { mode: BlendModes.Screen, name: 'Screen' },
    // Advanced (backdrop-aware) modes — correct coverage, work with alpha.
    { mode: BlendModes.Darken, name: 'Darken' },
    { mode: BlendModes.Lighten, name: 'Lighten' },
    { mode: BlendModes.Overlay, name: 'Overlay' },
    { mode: BlendModes.ColorDodge, name: 'Color Dodge' },
    { mode: BlendModes.ColorBurn, name: 'Color Burn' },
    { mode: BlendModes.HardLight, name: 'Hard Light' },
    { mode: BlendModes.SoftLight, name: 'Soft Light' },
    { mode: BlendModes.Difference, name: 'Difference' },
    { mode: BlendModes.Exclusion, name: 'Exclusion' },
    { mode: BlendModes.Hue, name: 'Hue' },
    { mode: BlendModes.Saturation, name: 'Saturation' },
    { mode: BlendModes.Color, name: 'Color' },
    { mode: BlendModes.Luminosity, name: 'Luminosity' },
];
class BlendmodesScene extends Scene {
    background;
    left;
    right;
    index = 0;
    ticker = 0;
    hud;
    cycle;
    // Note: passing `options` as a 3rd argument to `loader.get(…)` or
    // `loader.load(Asset.kind('texture', …))` alongside a non-Json type currently mis-resolves
    // the overload (falls through to the `Json` generic and types the result as
    // `unknown`) — see the flagged deviation in the migration report. `load()`
    // is awaited here purely to seed the fetch with `scaleMode: Nearest`; its
    // return value is intentionally unused. The subsequent 2-argument `get()`
    // calls for the same sources are unaffected and stay seamless.
    async init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        const samplerOptions = { scaleMode: ScaleModes.Nearest };
        await this.loader.load(Asset.kind('texture', ALPHA_RINGS, { samplerOptions }));
        await this.loader.load(Asset.kind('texture', assets.demo.textures.shipA, { samplerOptions }));
        const backgroundTexture = this.loader.get(ALPHA_RINGS);
        const shipTexture = this.loader.get(assets.demo.textures.shipA);
        this.background = new Sprite(backgroundTexture);
        this.background.setPosition(width / 2, height / 2);
        this.background.setAnchor(0.5, 0.5);
        this.background.setScale(Math.max(width, height) / 256);
        this.background.setTint(new Color(120, 130, 150));
        // Two overlapping sprites in complementary hues so the composite in the
        // overlap region differs clearly between modes.
        this.left = new Sprite(shipTexture);
        this.left.setAnchor(0.5, 0.5);
        this.left.setScale(5);
        this.left.setTint(new Color(80, 210, 255));
        this.right = new Sprite(shipTexture);
        this.right.setAnchor(0.5, 0.5);
        this.right.setScale(5);
        this.right.setTint(new Color(255, 96, 200));
        this.hud = mountControls({
            title: 'Blend Modes',
            controls: [{ keys: 'Click', action: 'next blend mode' }],
        });
        this.cycle = mountControlPanel({ title: 'Compositing' }).addCycle({
            label: 'Blend mode',
            options: BLEND_MODES.map(entry => entry.name),
            index: 0,
            onChange: index => this.setIndex(index),
        });
        app.input.onPointerDown.add(() => this.setIndex((this.index + 1) % BLEND_MODES.length));
        // Apply the initial mode (Normal) without skipping it.
        this.applyBlendMode();
    }
    setIndex(index) {
        this.index = ((index % BLEND_MODES.length) + BLEND_MODES.length) % BLEND_MODES.length;
        this.applyBlendMode();
    }
    applyBlendMode() {
        const { mode, name } = BLEND_MODES[this.index];
        this.left.setBlendMode(mode);
        this.right.setBlendMode(mode);
        this.cycle.set(this.index);
        this.hud.setStatus(`${name}  (${this.index + 1}/${BLEND_MODES.length})`);
    }
    update(delta) {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        const offset = (Math.cos(this.ticker * 1.4) * 0.5 + 0.5) * (width * 0.22);
        this.left.setPosition(width / 2 - offset, height / 2);
        this.right.setPosition(width / 2 + offset, height / 2);
        this.ticker += delta.seconds;
    }
    draw(context) {
        context.backend.clear();
        context.render(this.background);
        context.render(this.left);
        context.render(this.right);
    }
}
app.start(new BlendmodesScene());
