// Auto-generated from color-matrix-filter.ts - edit the .ts source, not this file.
import { Application, Color, ColorMatrixFilter, FixedResolutionCanvasSizing, LutFilter, Scene, Sprite, Text } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
const RAMP_SIZE = 256;
const LUT_SIZE = 17;
const makeRamp = () => {
  const canvas = document.createElement('canvas');
  canvas.width = RAMP_SIZE;
  canvas.height = 1;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas context unavailable.');
  }
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
  if (!context) {
    throw new Error('2D canvas context unavailable.');
  }
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
const TILE = 220;
class ColorTransformsScene extends Scene {
  sprites = [];
  labels = [];
  owned = [];
  async load() {
    const [ramp, art] = await Promise.all([this.loader.load(assets.primaryRamp), this.loader.load(assets.backgroundForest)]);
    const { width, height } = this.app;
    // Grading is display-referred: the matrices and both lookups run on encoded
    // sRGB values, which is what the numbers below were written against, and
    // the result returns to linear premultiplied colour. `'linear-srgb'` would
    // apply the same numbers to linear light instead. The LUT images are
    // numeric tables (`fromImage` never decodes them).
    const curves = LutFilter.fromImage(makeRamp());
    const cube = LutFilter.fromImage(makeCoolLut());
    const columns = [
      { label: 'Original', filter: null },
      { label: 'Matrix: grayscale', filter: new ColorMatrixFilter(undefined, { colorSpace: 'srgb' }).grayscale() },
      { label: 'Matrix: sepia', filter: new ColorMatrixFilter(undefined, { colorSpace: 'srgb' }).sepia() },
      { label: '1D ramp: curves', filter: new LutFilter({ mode: 'rgb1d', colorSpace: 'srgb' }).setLut(curves) },
      { label: '3D LUT: cool grade', filter: new LutFilter({ mode: '3d', size: LUT_SIZE, colorSpace: 'srgb' }).setLut(cube) },
    ];
    const step = width / columns.length;
    this.owned.push(curves, cube);
    columns.forEach(({ label, filter }, index) => {
      const x = step * (index + 0.5);
      if (filter) {
        this.owned.push(filter);
      }
      [ramp, art].forEach((texture, row) => {
        const sprite = new Sprite(texture).setAnchor(0.5).setPosition(x, height / 2 + (row - 0.5) * (TILE + 24));
        // The colour ramp is a short strip; stretching it to a square tile
        // keeps every hue large enough to compare.
        sprite.width = TILE;
        sprite.height = texture === ramp ? TILE * 0.6 : (TILE * texture.height) / texture.width;
        sprite.filters = filter ? [filter] : [];
        this.sprites.push(sprite);
      });
      this.labels.push(new Text(label, { fontSize: 17, fillColor: Color.white }).setAnchor(0.5).setPosition(x, 60));
    });
  }
  draw(context) {
    for (const drawable of [...this.sprites, ...this.labels]) {
      context.render(drawable);
    }
  }
  destroy() {
    for (const resource of this.owned) {
      resource.destroy();
    }
    super.destroy();
  }
}
const app = new Application({
  scenes: { ColorTransformsScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
});
await app.start(ColorTransformsScene);
