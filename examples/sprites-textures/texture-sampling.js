// Auto-generated from texture-sampling.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Keyboard, PixelSnapMode, ScaleModes, Scene, Sprite, Text, Texture } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
const MODES = [
  { label: 'Nearest', scaleMode: ScaleModes.Nearest, mipmaps: false },
  { label: 'Linear', scaleMode: ScaleModes.Linear, mipmaps: false },
  { label: 'Linear + mipmaps', scaleMode: ScaleModes.LinearMipmapLinear, mipmaps: true },
];
const makePattern = () => {
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
class TextureSamplingScene extends Scene {
  reference;
  sample;
  referenceTexture;
  sampleTexture;
  referenceLabel;
  sampleLabel;
  hud;
  mode = 0;
  zoom = 8;
  snap = false;
  elapsed = 0;
  onWheel = (_deltaX, deltaY) => {
    this.zoom = Math.max(0.3, Math.min(12, this.zoom * Math.exp(-deltaY * 0.002)));
    this.updateHud();
  };
  init() {
    const source = makePattern();
    this.referenceTexture = new Texture(source, { scaleMode: ScaleModes.Nearest, generateMipMap: false });
    this.sampleTexture = new Texture(source, { scaleMode: ScaleModes.Nearest, generateMipMap: false });
    this.reference = new Sprite(this.referenceTexture).setAnchor(0.5);
    this.sample = new Sprite(this.sampleTexture).setAnchor(0.5);
    this.reference.pixelSnapMode = PixelSnapMode.Geometry;
    this.referenceLabel = new Text('Reference: nearest + snap', { fillColor: Color.white, fontSize: 20 });
    this.sampleLabel = new Text('', { fillColor: Color.white, fontSize: 20 });
    this.referenceLabel.setPosition(this.app.width * 0.18, this.app.height * 0.78);
    this.sampleLabel.setPosition(this.app.width * 0.6, this.app.height * 0.78);
    this.hud = mountControls({
      title: 'Texture Sampling and Pixel Snapping',
      controls: [
        { keys: 'Space', action: 'cycle sample filtering' },
        { keys: 'P', action: 'toggle sample snapping' },
        { keys: 'Wheel', action: 'zoom both images' },
      ],
      hint: 'Compare the right image with the fixed nearest-filtered reference while zooming in and out.',
    });
    this.inputs.onTrigger(Keyboard.Space, () => this.selectMode((this.mode + 1) % MODES.length));
    this.inputs.onTrigger(Keyboard.P, () => {
      this.snap = !this.snap;
      this.sample.pixelSnapMode = this.snap ? PixelSnapMode.Geometry : PixelSnapMode.None;
      this.updateHud();
    });
    this.app.input.onMouseWheel.add(this.onWheel);
    this.updateHud();
  }
  selectMode(index) {
    this.mode = index;
    this.sampleTexture.setScaleMode(MODES[index].scaleMode);
    this.sampleTexture.setGenerateMipMap(MODES[index].mipmaps);
    this.updateHud();
  }
  updateHud() {
    this.sampleLabel.text = `Sample: ${MODES[this.mode].label}${this.snap ? ' + snap' : ''}`;
    this.hud.setStatus(`Zoom ${this.zoom.toFixed(2)}x · ${MODES[this.mode].label} · snap ${this.snap ? 'on' : 'off'}`);
  }
  update(delta) {
    this.elapsed += delta;
    const drift = Math.sin(this.elapsed * 1.8) * 0.45;
    this.reference.setPosition(this.app.width * 0.3 + drift, this.app.height * 0.54 + drift);
    this.sample.setPosition(this.app.width * 0.7 + drift, this.app.height * 0.54 + drift);
    this.reference.setScale(this.zoom);
    this.sample.setScale(this.zoom);
  }
  draw(context) {
    context.render(this.reference);
    context.render(this.sample);
    context.render(this.referenceLabel);
    context.render(this.sampleLabel);
  }
  destroy() {
    this.app.input.onMouseWheel.remove(this.onWheel);
    this.hud.dispose();
    super.destroy();
    this.referenceTexture.destroy();
    this.sampleTexture.destroy();
  }
}
const app = new Application({
  scenes: { TextureSamplingScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(14, 18, 27),
});
await app.start(TextureSamplingScene);
