// Auto-generated from blendmodes.ts - edit the .ts source, not this file.
import { Application, Asset, BlendModes, Color, FixedResolutionCanvasSizing, ScaleModes, Scene, Sprite } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { mountControls } from '@examples/runtime';
const ALPHA_RINGS = assets.alphaGradientRings;
// Blending runs in linear light on premultiplied colour, so a mode reads
// brighter and less muddy than the same equation on encoded values would. The
// result alpha follows source-over coverage for the coverage-preserving modes
// (Additive keeps its RGB sum, Subtract attenuates the destination rather than
// subtracting arithmetically).
//
// Every public blend mode, in enum order, paired with a display name.
const BLEND_MODES = [
  { mode: BlendModes.Normal, name: 'Normal' },
  { mode: BlendModes.Additive, name: 'Additive' },
  { mode: BlendModes.Subtract, name: 'Subtract' },
  { mode: BlendModes.Multiply, name: 'Multiply' },
  { mode: BlendModes.Screen, name: 'Screen' },
  // Advanced (backdrop-aware) modes - correct coverage, work with alpha.
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
  async load() {
    const app = this.app;
    const { width, height } = app;
    // Nearest sampling keeps the ring edges and the ship's pixels crisp at 5x.
    const textureOptions = { scaleMode: ScaleModes.Nearest };
    const backgroundTexture = await this.loader.load(Asset.type('texture', ALPHA_RINGS.source, { textureOptions }));
    const shipTexture = await this.loader.load(Asset.type('texture', assets.ship.source, { textureOptions }));
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
    this.hud.setStatus(`${name}  (${this.index + 1}/${BLEND_MODES.length})`);
  }
  update(delta) {
    const app = this.app;
    const { width, height } = app;
    const offset = (Math.cos(this.ticker * 1.4) * 0.5 + 0.5) * (width * 0.22);
    this.left.setPosition(width / 2 - offset, height / 2);
    this.right.setPosition(width / 2 + offset, height / 2);
    this.ticker += delta;
  }
  draw(context) {
    context.render(this.background);
    context.render(this.left);
    context.render(this.right);
  }
}
const app = new Application({
  scenes: { BlendmodesScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  // A mid-tone backdrop so darkening modes (Subtract, Multiply, Darken) stay
  // visible instead of compositing into a black canvas.
  clearColor: new Color(48, 54, 68),
});
await app.start(BlendmodesScene);
