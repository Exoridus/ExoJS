// Auto-generated from color-pipeline.ts - edit the .ts source, not this file.
import {
  Application,
  BlendModes,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  RenderTexture,
  ScaleModes,
  Scene,
  Sprite,
  Text,
  Texture,
  TextureFormat,
} from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
const COLUMNS = [40, 450, 860];
const ROWS = [160, 440];
const SWATCH = 96;
const TONE_MAPPINGS = ['none', 'reinhard'];
const HDR_VALUES = [2, 4, 16];
const srgbToLinear = channel => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
const solidCanvas = (r, g, b, size = 4) => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('2D canvas context unavailable.');
  context.fillStyle = `rgb(${r}, ${g}, ${b})`;
  context.fillRect(0, 0, size, size);
  return canvas;
};
// An opaque left half next to fully transparent pixels: the case where
// filtering at the edge must not pull in the transparent neighbours' colour.
const edgeCanvas = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('2D canvas context unavailable.');
  context.fillStyle = 'rgb(255, 40, 40)';
  context.fillRect(2, 2, 6, 12);
  return canvas;
};
const rect = (x, y, width, height, color) => {
  const graphics = new Graphics();
  graphics.fillColor = color;
  graphics.drawRectangle(x, y, width, height);
  return graphics;
};
class ColorPipelineScene extends Scene {
  nodes = [];
  textures = [];
  labels = [];
  hud;
  numericTarget = null;
  srgbTarget = null;
  hdrTarget = null;
  numericPaint;
  srgbPaint;
  hdrPaint;
  hdrSwatches = [];
  readbackReadout;
  hdrReadout;
  hdrSupported = false;
  toneIndex = 1;
  frame = 0;
  painted = false;
  label(text, x, y, size = 15, color = new Color(190, 205, 230)) {
    const label = new Text(text, { fontSize: size, fillColor: color }).setPosition(x, y);
    this.labels.push(label);
    return label;
  }
  texture(canvas, colorSpace, scaleMode = ScaleModes.Nearest) {
    const texture = new Texture(canvas, { scaleMode, generateMipMap: false, ...(colorSpace === undefined ? {} : { colorSpace }) });
    this.textures.push(texture);
    return texture;
  }
  container(...children) {
    const container = new Container();
    for (const child of children) container.addChild(child);
    this.nodes.push(container);
    return container;
  }
  init() {
    const [c0, c1, c2] = COLUMNS;
    const [r0, r1] = ROWS;
    const title = (text, x, y) => void this.label(text, x, y, 20, Color.white);
    // 1. The same gray bytes read as colour (sRGB) and as numeric data.
    title('1. Colour versus data', c0, r0);
    const gray = solidCanvas(128, 128, 128);
    const asColor = new Sprite(this.texture(gray)).setScale(SWATCH / 4).setPosition(c0, r0 + 50);
    const asData = new Sprite(this.texture(gray, 'none')).setScale(SWATCH / 4).setPosition(c0 + 200, r0 + 50);
    this.nodes.push(asColor, asData);
    this.label('as colour', c0, r0 + 155);
    this.label(`decoded: ${srgbToLinear(128 / 255).toFixed(3)} linear`, c0, r0 + 178);
    this.label('as data', c0 + 200, r0 + 155);
    this.label(`used as ${(128 / 255).toFixed(3)}, brighter`, c0 + 200, r0 + 178);
    // 2. A 50% white over black: linear-light source-over versus an encoded-space reference.
    title('2. Blending in linear light', c1, r0);
    const backdrop = rect(0, 0, SWATCH + 200, SWATCH, Color.black).setPosition(c1, r0 + 50);
    const linearBlend = rect(0, 0, SWATCH, SWATCH, new Color(255, 255, 255, 0.5)).setPosition(c1, r0 + 50);
    const encodedReference = rect(0, 0, SWATCH, SWATCH, new Color(128, 128, 128)).setPosition(c1 + 200, r0 + 50);
    this.nodes.push(backdrop, linearBlend, encodedReference);
    this.label('engine: linear 50%', c1, r0 + 155);
    this.label('encodes to 188', c1, r0 + 178);
    this.label('encoded-space blend', c1 + 200, r0 + 155);
    this.label('gives the darker 128', c1 + 200, r0 + 178);
    // 3. Alpha edges.
    title('3. Alpha edges', c2, r0);
    const white = rect(0, 0, 190, 190, Color.white).setPosition(c2, r0 + 40);
    const edges = new Sprite(this.texture(edgeCanvas(), undefined, ScaleModes.Linear)).setScale(11).setPosition(c2, r0 + 40);
    this.nodes.push(white, edges);
    this.label('Bilinear magnification', c2 + 205, r0 + 60);
    this.label('of an opaque block', c2 + 205, r0 + 82);
    this.label('beside transparent', c2 + 205, r0 + 104);
    this.label('pixels. Colour and alpha', c2 + 205, r0 + 134);
    this.label('filter together, so the', c2 + 205, r0 + 156);
    this.label('rim shows no dark fringe.', c2 + 205, r0 + 178);
    // 4. A normal map read as data versus wrongly as colour.
    title('4. Normal maps are data', c0, r1);
    const flat = solidCanvas(128, 128, 255);
    const normalData = new Sprite(this.texture(flat, 'none')).setScale(SWATCH / 4).setPosition(c0, r1 + 50);
    const normalColor = new Sprite(this.texture(flat)).setScale(SWATCH / 4).setPosition(c0 + 200, r1 + 50);
    this.nodes.push(normalData, normalColor);
    const decodedXy = 2 * srgbToLinear(128 / 255) - 1;
    this.label('as data: correct', c0, r1 + 155);
    this.label(`normal.xy = ${(2 * (128 / 255) - 1).toFixed(2)}`, c0, r1 + 178);
    this.label('as colour: wrong', c0 + 200, r1 + 155);
    this.label(`normal.xy = ${decodedXy.toFixed(2)}`, c0 + 200, r1 + 178);
    // 5 and 6 render into small targets once and read them back.
    title('5. Raw versus display readback', c1, r1);
    this.numericPaint = this.container(rect(0, 0, 4, 4, new Color(128, 128, 128)));
    this.srgbPaint = this.container(rect(0, 0, 4, 4, new Color(128, 128, 128)));
    this.numericTarget = new RenderTexture(4, 4, { format: TextureFormat.Rgba8 });
    this.srgbTarget = new RenderTexture(4, 4, { format: TextureFormat.Rgba8Srgb });
    this.label('A gray Color painted into two targets.', c1, r1 + 50);
    this.readbackReadout = [this.label('Rgba8 target: reading...', c1, r1 + 90), this.label('Rgba8Srgb target: reading...', c1, r1 + 150)];
    this.label('raw = stored bytes, no hidden transform', c1, r1 + 220);
    this.label('display = readImageData, sRGB encoded', c1, r1 + 243);
    title('6. Internal HDR to SDR', c2, r1);
    const caps = this.app.backend.getColorFormatCapabilities(TextureFormat.Rgba16F);
    this.hdrSupported = caps.renderable && caps.blendable && this.app.rendering.supportsReadbackFormat(TextureFormat.Rgba16F);
    if (this.hdrSupported) {
      const paint = new Container();
      const unit = this.texture(solidCanvas(255, 255, 255, 1));
      HDR_VALUES.forEach((value, index) => {
        // Additive white, one layer per unit, builds a linear value above display white.
        for (let layer = 0; layer < value; layer++) {
          paint.addChild(new Sprite(unit).setPosition(index, 0).setBlendMode(BlendModes.Additive));
        }
      });
      this.hdrPaint = paint;
      this.nodes.push(paint);
      this.hdrTarget = new RenderTexture(HDR_VALUES.length, 1, { format: TextureFormat.Rgba16F });
      this.hdrSwatches = HDR_VALUES.map((_, index) => rect(0, 0, 64, 64, Color.black).setPosition(c2 + index * 90, r1 + 50));
      this.nodes.push(...this.hdrSwatches);
      this.hdrReadout = [this.label('raw linear: reading...', c2, r1 + 125), this.label('', c2, r1 + 148), this.label('', c2, r1 + 171)];
      this.label('Values 2, 4 and 16 survive in the', c2, r1 + 205);
      this.label('float target; the swatches show them', c2, r1 + 228);
      this.label('after the chosen SDR transform.', c2, r1 + 251);
    } else {
      this.hdrReadout = [];
      this.label('Unavailable on this device.', c2, r1 + 50, 16, new Color(255, 200, 120));
      this.label('Rendering, blending and readback of', c2, r1 + 90);
      this.label('RGBA16F are not all supported here.', c2, r1 + 113);
      this.label('The SDR panels are unaffected.', c2, r1 + 150);
    }
    this.hud = mountControls({
      title: 'Colour Pipeline',
      corner: 'top-left',
      controls: this.hdrSupported ? [{ keys: 'Space', action: 'HDR panel: clamp or Reinhard' }] : [],
      status: this.hdrSupported ? `HDR panel: ${TONE_MAPPINGS[this.toneIndex]}` : 'HDR panel unavailable',
      hint: 'Colour blends in linear light and is encoded once at output; data stays numeric.',
    });
    if (this.hdrSupported) {
      this.inputs.onTrigger(Keyboard.Space, () => {
        this.toneIndex = (this.toneIndex + 1) % TONE_MAPPINGS.length;
        this.hud.setStatus(`HDR panel: ${TONE_MAPPINGS[this.toneIndex]}`);
        void this.readHdr();
      });
    }
  }
  async readbacks() {
    const rendering = this.app.rendering;
    const numeric = this.numericTarget;
    const srgb = this.srgbTarget;
    const rawNumeric = await rendering.readPixels(numeric);
    const shownNumeric = await rendering.readImageData(numeric);
    const rawSrgb = await rendering.readPixels(srgb);
    const shownSrgb = await rendering.readImageData(srgb);
    this.readbackReadout[0].text = `Rgba8:  raw ${rawNumeric.data[0]}  display ${shownNumeric.data[0]}`;
    this.readbackReadout[1].text = `Rgba8Srgb:  raw ${rawSrgb.data[0]}  display ${shownSrgb.data[0]}`;
    if (this.hdrSupported) await this.readHdr();
  }
  async readHdr() {
    const rendering = this.app.rendering;
    const target = this.hdrTarget;
    const raw = await rendering.readPixels(target, { dataType: 'float32' });
    const shown = await rendering.readImageData(target, { toneMapping: TONE_MAPPINGS[this.toneIndex] });
    this.hdrReadout[0].text = `raw linear: ${Array.from({ length: HDR_VALUES.length }, (_, index) => raw.data[index * 4].toFixed(0)).join(' / ')}`;
    this.hdrReadout[1].text = `${TONE_MAPPINGS[this.toneIndex]}: ${Array.from({ length: HDR_VALUES.length }, (_, index) => shown.data[index * 4]).join(' / ')} (encoded)`;
    this.hdrReadout[2].text = '';
    this.hdrSwatches.forEach((swatch, index) => {
      const code = shown.data[index * 4];
      swatch.clear();
      swatch.fillColor = new Color(code, code, code);
      swatch.drawRectangle(0, 0, 64, 64);
    });
  }
  update() {
    this.frame++;
    // The paint frame must have finished before the GPU read that depends on it.
    if (this.painted && this.frame === 4) void this.readbacks();
  }
  draw(context) {
    if (!this.painted) {
      context.renderTo(this.numericPaint, { target: this.numericTarget, clear: Color.black });
      context.renderTo(this.srgbPaint, { target: this.srgbTarget, clear: Color.black });
      if (this.hdrTarget !== null) context.renderTo(this.hdrPaint, { target: this.hdrTarget, clear: Color.black });
      this.painted = true;
      this.frame = 0;
    }
    for (const node of this.nodes) {
      if (node !== this.numericPaint && node !== this.srgbPaint && node !== this.hdrPaint) context.render(node);
    }
    for (const label of this.labels) context.render(label);
  }
  destroy() {
    this.hud?.dispose();
    this.numericTarget?.destroy();
    this.srgbTarget?.destroy();
    this.hdrTarget?.destroy();
    for (const texture of this.textures) texture.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { ColorPipelineScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(20, 24, 34),
});
await app.start(ColorPipelineScene);
