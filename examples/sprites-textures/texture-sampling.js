// Auto-generated from texture-sampling.ts - edit the .ts source, not this file.
import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  PixelSnapMode,
  ScaleModes,
  Scene,
  Sprite,
  Text,
  Texture,
} from '@codexo/exojs';
import { choice, demoPanel, slider, startExample, toggle } from '@examples/runtime';
const MODES = [
  { label: 'Nearest', scaleMode: ScaleModes.Nearest, mipmaps: false },
  { label: 'Linear', scaleMode: ScaleModes.Linear, mipmaps: false },
  { label: 'Linear + mips', scaleMode: ScaleModes.LinearMipmapLinear, mipmaps: true },
];
const makePixelArt = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f9d66e' : '#284b7a';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.fillStyle = '#ff627d';
  ctx.fillRect(9, 9, 14, 14);
  return canvas;
};
// Zone plate: rings whose spacing shrinks towards the edge until it is finer
// than a pixel. Drawn smaller than its size, everything past that point
// aliases into false patterns unless mipmaps pre-average it.
const makeZonePlate = () => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2;
      const dy = y - size / 2;
      // Ring frequency grows with the radius but stays below the texture's own
      // Nyquist limit, so the source itself is alias-free.
      const v = 0.5 + 0.5 * Math.cos((Math.PI * (dx * dx + dy * dy)) / (2 * size));
      const i = (y * size + x) * 4;
      image.data[i] = 40 + v * 215;
      image.data[i + 1] = 60 + v * 190;
      image.data[i + 2] = 90 + v * 150;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
};
const controls = {
  magnify: slider('Magnify', { min: 1, max: 8, value: 3, step: 0.1 }),
  minify: slider('Minify', { min: 0.1, max: 0.5, value: 0.25, step: 0.01 }),
  snap: choice('Pixel snap', ['None', 'Position', 'Geometry']),
  motion: toggle('Motion', true),
};
class TextureSamplingScene extends Scene {
  magnified = [];
  minified = [];
  labels = [];
  grid = new Graphics();
  panel;
  elapsed = 0;
  cameraMotion = false;
  cameraTime = 0;
  zoom = 1;
  onWheel = (_x, y) => {
    this.zoom = Math.min(1.6, Math.max(0.5, this.zoom * Math.exp(-y * 0.001)));
  };
  init() {
    const pixelArt = makePixelArt();
    const zone = makeZonePlate();
    for (const mode of MODES) {
      // Color is sRGB; numeric textures use colorSpace: 'none'. All columns share each source and clock.
      this.magnified.push(
        new Sprite(this.track(new Texture(pixelArt, { scaleMode: mode.scaleMode, generateMipMap: mode.mipmaps }))).setAnchor(0.5),
      );
      this.minified.push(
        new Sprite(this.track(new Texture(zone, { scaleMode: mode.scaleMode, generateMipMap: mode.mipmaps }))).setAnchor(0.5),
      );
      this.labels.push(new Text(mode.label, { fillColor: Color.white, fontSize: 14, align: 'center' }).setAnchor(0.5));
    }
    this.root.addChild(this.grid, ...this.magnified, ...this.minified);
    this.panel = demoPanel({
      scene: this,
      title: 'Texture Sampling and Pixel Snapping',
      layout: 'bar',
      controls,
      hint: 'Wheel: fractional camera zoom. Snap changes rendering, never logical positions. Rotation/skew may fall back to position snapping.',
      actions: {
        'Camera drift': () => {
          this.cameraMotion = !this.cameraMotion;
        },
        Reset: () => this.reset(),
      },
    });
    this.inputs.onTrigger(Keyboard.Space, () => this.panel.step('motion'));
    this.inputs.onTrigger(Keyboard.P, () => this.panel.step('snap'));
    this.inputs.onTrigger(Keyboard.R, () => this.reset());
    this.app.input.onMouseWheel.add(this.onWheel);
  }
  reset() {
    this.elapsed = 0;
    this.zoom = 1;
    this.cameraMotion = false;
    this.cameraTime = 0;
    this.panel.set('magnify', 3);
    this.panel.set('minify', 0.25);
    this.panel.set('snap', 'None');
  }
  update(delta) {
    const view = this.panel.fit(this.app, this.app.canvas);
    if (this.panel.values.motion) {
      this.elapsed += delta;
    }
    if (this.cameraMotion) {
      this.cameraTime += delta;
    }
    this.root.setScale(view.scale);
    const drift = Math.sin(this.elapsed * 1.8) * 0.45;
    const snap = { None: PixelSnapMode.None, Position: PixelSnapMode.Position, Geometry: PixelSnapMode.Geometry }[this.panel.values.snap];
    this.grid.clear();
    this.grid.lineWidth = 1;
    this.grid.lineColor = new Color(255, 255, 255, 0.12);
    for (let x = 0; x < view.width; x += 16) {
      this.grid.drawLine(x, 32, x, view.contentHeight);
    }
    for (let y = 32; y < view.contentHeight; y += 16) {
      this.grid.drawLine(0, y, view.width, y);
    }
    for (let i = 0; i < 3; i++) {
      const x = (view.width * (i + 0.5)) / 3;
      this.magnified[i].setPosition(x + drift, view.contentHeight * 0.34).setScale(this.panel.values.magnify);
      this.minified[i].setPosition(x + drift, view.contentHeight * 0.77).setScale(this.panel.values.minify);
      this.magnified[i].pixelSnapMode = snap;
      this.minified[i].pixelSnapMode = snap;
      this.labels[i].setPosition(x * view.scale, 14 * view.scale).setScale(view.scale);
    }
    this.app.rendering.view
      .setCenter(this.app.width / 2 + (this.cameraMotion ? Math.sin(this.cameraTime) * 0.6 * view.scale : 0), this.app.height / 2)
      .setZoom(this.zoom);
    const canvas = this.app.canvas;
    this.panel.status(
      `CSS ${view.width.toFixed(0)}x${view.height.toFixed(0)} | logical ${this.app.width}x${this.app.height} | buffer ${canvas.width}x${canvas.height} | DPR ${devicePixelRatio} | ratio ${this.app.pixelRatio} | zoom ${this.zoom.toFixed(2)} | camera ${this.cameraMotion ? 'moving' : 'still'}`,
    );
  }
  draw(context) {
    context.render(this.root);
    for (const label of this.labels) {
      context.render(label, { view: context.screenView });
    }
  }
  destroy() {
    this.app.input.onMouseWheel.remove(this.onWheel);
    this.app.rendering.view.setCenter(this.app.width / 2, this.app.height / 2).setZoom(1);
    this.panel.dispose();
    super.destroy();
    for (const label of this.labels) {
      label.destroy();
    }
  }
}
const app = new Application({
  scenes: { TextureSamplingScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(38, 44, 52),
});
await startExample(app, () => app.start(TextureSamplingScene));
