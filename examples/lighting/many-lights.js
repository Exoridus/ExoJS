// Auto-generated from many-lights.ts - edit the .ts source, not this file.
import { Application, Color, Container, FixedResolutionCanvasSizing, ScaleModes, Scene, Sprite, Texture } from '@codexo/exojs';
import { LightingSystem, LitSpriteMaterial, PointLight } from '@codexo/exojs-lighting';
import { mountControlPanel, mountControls } from '@examples/runtime';
// The light list is a data texture, not a uniform array, so the light count is
// a shader loop bound rather than a compiled-in constant: the slider below
// walks from 1 to 48 lights without recompiling anything and without adding a
// draw call. The floor is one batch of sprites sharing one LitSpriteMaterial.
const MAX_LIGHTS = 48;
const TILE_SIZE = 128;
const HUE_STEP = 360 / 7;
const canvasTexture = (size, paint) => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('2D canvas context unavailable.');
  paint(context);
  return new Texture(canvas, { scaleMode: ScaleModes.Linear, generateMipMap: false });
};
// Flat stone albedo with a mortar cross, so the tiling is visible even unlit.
const albedoTexture = canvasTexture(TILE_SIZE, context => {
  context.fillStyle = '#9a958c';
  context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  context.fillStyle = '#6e6a63';
  context.fillRect(0, 0, TILE_SIZE, 4);
  context.fillRect(0, 0, 4, TILE_SIZE);
});
// Matching normal map: a rounded bevel around the tile edge and a shallow dome
// in the middle, so a light sweeping past visibly rakes across the relief.
const normalTexture = canvasTexture(TILE_SIZE, context => {
  const image = context.createImageData(TILE_SIZE, TILE_SIZE);
  const half = TILE_SIZE / 2;
  const bevel = 14;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const edge = Math.min(x, y, TILE_SIZE - 1 - x, TILE_SIZE - 1 - y);
      const slope = edge < bevel ? 1 - edge / bevel : 0;
      const towardsX = x < half ? -1 : 1;
      const towardsY = y < half ? -1 : 1;
      const horizontal = Math.min(x, TILE_SIZE - 1 - x) <= Math.min(y, TILE_SIZE - 1 - y);
      const nx = horizontal ? towardsX * slope : ((x - half) / half) * 0.25;
      const ny = horizontal ? ((y - half) / half) * 0.25 : towardsY * slope;
      const length = Math.hypot(nx, ny, 1);
      const offset = (y * TILE_SIZE + x) * 4;
      image.data[offset] = ((nx / length) * 0.5 + 0.5) * 255;
      image.data[offset + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      image.data[offset + 2] = (1 / length) * 0.5 * 255 + 127.5;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
});
// Evenly spaced hues at a fixed lightness, so neighbouring pools of light stay
// distinguishable without any of them blowing out to white.
const lightColor = index => {
  const hue = (index * HUE_STEP) % 360;
  const component = offset => {
    const k = (offset + hue / 30) % 12;
    return Math.round(255 * (0.62 - 0.38 * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return new Color(component(0), component(8), component(4));
};
class ManyLightsScene extends Scene {
  floor;
  markerLayer;
  lighting;
  orbits;
  visibleLights = 24;
  elapsed = 0;
  hud;
  init() {
    const { width, height } = this.app;
    this.floor = new Container();
    this.markerLayer = new Container();
    this.lighting = new LightingSystem({ maxLights: MAX_LIGHTS, ambient: new Color(16, 16, 24) });
    this.systems.add(this.lighting);
    const material = new LitSpriteMaterial({ lighting: this.lighting, normalMap: normalTexture });
    for (let y = 0; y < Math.ceil(height / TILE_SIZE); y++) {
      for (let x = 0; x < Math.ceil(width / TILE_SIZE); x++) {
        const tile = new Sprite(albedoTexture);
        tile.setPosition(x * TILE_SIZE, y * TILE_SIZE);
        tile.material = material;
        this.floor.addChild(tile);
      }
    }
    this.orbits = Array.from({ length: MAX_LIGHTS }, (_, index) => {
      const color = lightColor(index);
      const light = new PointLight({ radius: 190, intensity: 1.6, height: 46, color });
      const marker = new Sprite(Texture.fromColor(color, 6)).setAnchor(0.5);
      this.markerLayer.addChild(marker);
      return {
        light,
        marker,
        speed: 0.25 + (index % 7) * 0.08,
        phase: (index / MAX_LIGHTS) * Math.PI * 2,
        radiusX: width * (0.18 + ((index % 5) / 5) * 0.28),
        radiusY: height * (0.16 + ((index % 3) / 3) * 0.3),
      };
    });
    this.setVisibleLights(this.visibleLights);
    this.hud = mountControls({
      title: 'Many Lights',
      hint: `Up to ${MAX_LIGHTS} point lights over ${this.floor.children.length} tiles. The light list is a data texture, so the count is a loop bound - not a recompile.`,
      status: '',
    });
    const panel = mountControlPanel({ title: 'Lights', corner: 'top-right' });
    panel.addSlider({
      label: 'Active lights',
      min: 1,
      max: MAX_LIGHTS,
      step: 1,
      value: this.visibleLights,
      onChange: value => this.setVisibleLights(value),
    });
  }
  setVisibleLights(count) {
    this.visibleLights = count;
    this.lighting.clear();
    for (let index = 0; index < this.orbits.length; index++) {
      const orbit = this.orbits[index];
      const active = index < count;
      orbit.marker.visible = active;
      if (active) this.lighting.add(orbit.light);
    }
  }
  update(delta) {
    const { width, height } = this.app;
    this.elapsed += delta;
    for (let index = 0; index < this.visibleLights; index++) {
      const orbit = this.orbits[index];
      const angle = this.elapsed * orbit.speed + orbit.phase;
      const x = width / 2 + Math.cos(angle) * orbit.radiusX;
      const y = height / 2 + Math.sin(angle * 1.37 + orbit.phase) * orbit.radiusY;
      orbit.light.setPosition(x, y);
      orbit.marker.setPosition(x, y);
    }
  }
  draw(context) {
    context.render(this.floor);
    context.render(this.markerLayer);
    this.hud.setStatus(`${this.lighting.activeLightCount} lights - draw calls ${context.stats.drawCalls}`);
  }
}
const app = new Application({
  scenes: { ManyLightsScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(8, 8, 12),
});
await app.start(ManyLightsScene);
