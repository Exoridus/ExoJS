// Auto-generated from palette-cycling.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, LutFilter, Scene, Sprite } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
const PRIMARY_RAMP = assets.technical.color.primaryRamp;
const RAMP_SIZE = 256;
// One sine curve per channel, each a third of a cycle out of phase. A 1D LUT
// grades every channel through its OWN curve, so shifting all three by the same
// offset each frame sweeps the sprite through the colour wheel.
function buildRampCanvas(offset) {
  const canvas = document.createElement('canvas');
  canvas.width = RAMP_SIZE;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(RAMP_SIZE, 1);
  for (let i = 0; i < RAMP_SIZE; i++) {
    const phase = ((i + offset) / RAMP_SIZE) * Math.PI * 2;
    const r = Math.round(127 + 127 * Math.sin(phase));
    const g = Math.round(127 + 127 * Math.sin(phase + (Math.PI * 2) / 3));
    const b = Math.round(127 + 127 * Math.sin(phase + (Math.PI * 4) / 3));
    const o = i * 4;
    image.data[o] = r;
    image.data[o + 1] = g;
    image.data[o + 2] = b;
    image.data[o + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
class ColourRampCyclingScene extends Scene {
  ramp;
  filter;
  sprite;
  offset = 0;
  hud;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.ramp = LutFilter.fromImage(buildRampCanvas(0));
    this.filter = new LutFilter({ mode: 'rgb1d' }).setLut(this.ramp);
    this.sprite = new Sprite(this.loader.get(PRIMARY_RAMP)).setAnchor(0.5).setScale(4);
    this.sprite.setPosition(width / 2, height / 2);
    this.sprite.filters = [this.filter];
    this.hud = mountControls({
      title: 'Colour Ramp Cycling',
      status: 'Shifting an RGB 1D LUT each frame remaps the sprite colours.',
      hint: 'The texture never changes — only the per-channel curves the LUT applies to it.',
    });
  }
  update(delta) {
    this.offset = (this.offset + delta * 80) % RAMP_SIZE;
    this.ramp.source = buildRampCanvas(Math.floor(this.offset));
  }
  draw(context) {
    context.render(this.sprite);
  }
}
const app = new Application({
  scenes: { ColourRampCyclingScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});
app.start(ColourRampCyclingScene);
