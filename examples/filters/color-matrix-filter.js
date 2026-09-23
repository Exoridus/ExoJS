// Auto-generated from color-matrix-filter.ts - edit the .ts source, not this file.
import { Application, Color, ColorMatrixFilter, FixedResolutionCanvasSizing, LutFilter, Scene, Sprite, Text } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';
const RAMP_SIZE = 256;
const LUT_SIZE = 17;
const MODES = ['Matrix: grayscale', 'Matrix: sepia', '1D ramp: channel curves', '3D LUT: cool grade', 'Bypass'];
const makeRamp = () => {
  const canvas = document.createElement('canvas');
  canvas.width = RAMP_SIZE;
  canvas.height = 1;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable.');
  const image = context.createImageData(RAMP_SIZE, 1);
  for (let i = 0; i < RAMP_SIZE; i++) {
    const phase = (i / RAMP_SIZE) * Math.PI * 2;
    const offset = i * 4;
    image.data[offset] = Math.round(127 + 127 * Math.sin(phase));
    image.data[offset + 1] = Math.round(127 + 127 * Math.sin(phase + (Math.PI * 2) / 3));
    image.data[offset + 2] = Math.round(127 + 127 * Math.sin(phase + (Math.PI * 4) / 3));
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas;
};
const makeCoolLut = () => {
  const width = LUT_SIZE * LUT_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = LUT_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable.');
  const image = context.createImageData(width, LUT_SIZE);
  const max = LUT_SIZE - 1;
  for (let b = 0; b < LUT_SIZE; b++) {
    for (let g = 0; g < LUT_SIZE; g++) {
      for (let r = 0; r < LUT_SIZE; r++) {
        const offset = (g * width + b * LUT_SIZE + r) * 4;
        image.data[offset] = Math.round((r / max) * 0.85 * 255);
        image.data[offset + 1] = Math.round((g / max) * 0.95 * 255);
        image.data[offset + 2] = Math.round(Math.min(1, (b / max) * 1.15 + 0.05) * 255);
        image.data[offset + 3] = 255;
      }
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
};
class ColorTransformsScene extends Scene {
  reference;
  processed;
  referenceLabel;
  processedLabel;
  matrix;
  ramp;
  rampFilter;
  cube;
  cubeFilter;
  hud;
  init() {
    const { width, height } = this.app;
    const image = this.loader.get(assets.technical.color.primaryRamp);
    this.reference = new Sprite(image)
      .setAnchor(0.5)
      .setScale(3)
      .setPosition(width * 0.28, height / 2);
    this.processed = new Sprite(image)
      .setAnchor(0.5)
      .setScale(3)
      .setPosition(width * 0.72, height / 2);
    this.referenceLabel = new Text('ORIGINAL', { fontSize: 22, fillColor: Color.white }).setAnchor(0.5).setPosition(width * 0.28, height * 0.72);
    this.processedLabel = new Text('TRANSFORMED', { fontSize: 22, fillColor: Color.white }).setAnchor(0.5).setPosition(width * 0.72, height * 0.72);
    this.matrix = new ColorMatrixFilter();
    this.ramp = LutFilter.fromImage(makeRamp());
    this.rampFilter = new LutFilter({ mode: 'rgb1d' }).setLut(this.ramp);
    this.cube = LutFilter.fromImage(makeCoolLut());
    this.cubeFilter = new LutFilter({ mode: '3d', size: LUT_SIZE }).setLut(this.cube);
    this.hud = mountControls({
      title: 'Color Transforms',
      status: 'Matrix: grayscale',
      hint: 'The left image is unchanged. Compare a channel-mixing matrix, independent per-channel curves, and a 3D color lookup on the same right-hand image.',
    });
    mountControlPanel({ title: 'Transform' }).addCycle({
      label: 'Method',
      options: [...MODES],
      index: 0,
      onChange: index => this.setMode(index),
    });
    this.setMode(0);
  }
  setMode(index) {
    if (index === 0) this.processed.filters = [this.matrix.reset().grayscale()];
    else if (index === 1) this.processed.filters = [this.matrix.reset().sepia()];
    else if (index === 2) this.processed.filters = [this.rampFilter];
    else if (index === 3) this.processed.filters = [this.cubeFilter];
    else this.processed.filters = [];
    this.hud.setStatus(MODES[index] ?? MODES[4]);
  }
  draw(context) {
    context.render(this.reference);
    context.render(this.processed);
    context.render(this.referenceLabel);
    context.render(this.processedLabel);
  }
  destroy() {
    this.hud.dispose();
    this.matrix.destroy();
    this.rampFilter.destroy();
    this.cubeFilter.destroy();
    this.ramp.destroy();
    this.cube.destroy();
    this.referenceLabel.destroy();
    this.processedLabel.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { ColorTransformsScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
});
await app.start(ColorTransformsScene);
