import {
  Application,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  type RenderingContext,
  ScaleModes,
  Scene,
  type Seconds,
  Sprite,
  Texture,
} from '@codexo/exojs';
import { LightingSystem, LitSpriteMaterial, PointLight } from '@codexo/exojs-lighting';
import { mountControls } from '@examples/runtime';

// Forward normal mapping on plain sprites. A LitSpriteMaterial samples a
// tangent-space normal map next to the base texture and shades each fragment
// against the lights a LightingSystem publishes. Everything stays in one batch:
// the lights live in a data texture, not in extra draw calls.

const LIGHT_COUNT = 4;
const TILE_SIZE = 96;

// Draw into a canvas and wrap it as a texture. Both textures below are
// generated so the example carries no asset files.
const canvasTexture = (size: number, paint: (context: CanvasRenderingContext2D) => void): Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('2D canvas context unavailable.');
  paint(context);
  return new Texture(canvas, { scaleMode: ScaleModes.Linear, generateMipMap: false });
};

// Base colour: a matte disc with a checker so rotation and flips read clearly.
const albedoTexture = canvasTexture(TILE_SIZE, context => {
  const half = TILE_SIZE / 2;
  context.fillStyle = '#c8c0b0';
  context.beginPath();
  context.arc(half, half, half - 2, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#8a8070';
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      if ((x + y) % 2 === 0) continue;
      context.save();
      context.beginPath();
      context.arc(half, half, half - 2, 0, Math.PI * 2);
      context.clip();
      context.fillRect(x * (TILE_SIZE / 4), y * (TILE_SIZE / 4), TILE_SIZE / 4, TILE_SIZE / 4);
      context.restore();
    }
  }
});

// Normal map: hemisphere normals encoded as rgb = n * 0.5 + 0.5. +y points
// down the texture (towards larger v), matching the sprite's local y axis.
const normalTexture = canvasTexture(TILE_SIZE, context => {
  const image = context.createImageData(TILE_SIZE, TILE_SIZE);
  const half = TILE_SIZE / 2;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const dx = (x + 0.5 - half) / (half - 2);
      const dy = (y + 0.5 - half) / (half - 2);
      const inside = dx * dx + dy * dy;
      const nz = inside < 1 ? Math.sqrt(1 - inside) : 1;
      const nx = inside < 1 ? dx : 0;
      const ny = inside < 1 ? dy : 0;
      const offset = (y * TILE_SIZE + x) * 4;
      image.data[offset] = (nx * 0.5 + 0.5) * 255;
      image.data[offset + 1] = (ny * 0.5 + 0.5) * 255;
      image.data[offset + 2] = (nz * 0.5 + 0.5) * 255;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
});

const lightColors = [new Color(255, 180, 120), new Color(120, 180, 255), new Color(160, 255, 160), new Color(255, 120, 200)];

class NormalMappedSpritesScene extends Scene {
  private layer!: Container;
  private lighting!: LightingSystem;
  private material!: LitSpriteMaterial;
  private lights!: PointLight[];
  private tiles!: { sprite: Sprite; spin: number }[];
  private markers!: Sprite[];
  private elapsed = 0;
  private hud!: ReturnType<typeof mountControls>;

  override init(): void {
    const { width, height } = this.app;
    this.layer = new Container();

    this.lighting = new LightingSystem({ maxLights: LIGHT_COUNT, ambient: new Color(30, 30, 40) });
    this.material = new LitSpriteMaterial({ lighting: this.lighting, normalMap: normalTexture });

    // Scene systems tick after Scene.update(), so the packed light texture
    // always describes the frame that is about to be drawn.
    this.systems.add(this.lighting);

    this.lights = lightColors.map(color => {
      const light = new PointLight({ radius: 320, intensity: 1.4, height: 80, color });
      this.lighting.add(light);
      return light;
    });

    const columns = 8;
    const rows = 4;
    const spacing = 140;
    const originX = width / 2 - ((columns - 1) * spacing) / 2;
    const originY = height / 2 - ((rows - 1) * spacing) / 2;

    // A grid of lit tiles: every other one spins, every third one is mirrored,
    // so the basis rotation and the flip path both get exercised.
    this.tiles = [];
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const index = row * columns + column;
        const sprite = new Sprite(albedoTexture).setAnchor(0.5);
        sprite.setPosition(originX + column * spacing, originY + row * spacing);
        sprite.setScale(index % 3 === 0 ? -1 : 1, 1);
        sprite.material = this.material;
        this.layer.addChild(sprite);
        this.tiles.push({ sprite, spin: index % 2 === 0 ? 0 : index % 4 === 1 ? 45 : -30 });
      }
    }

    // Unlit markers show where the lights are.
    this.markers = lightColors.map(color => {
      const marker = new Sprite(Texture.fromColor(color, 12)).setAnchor(0.5);
      this.layer.addChild(marker);
      return marker;
    });

    this.hud = mountControls({
      title: 'Normal-Mapped Sprites',
      hint: `${LIGHT_COUNT} point lights shade ${this.tiles.length} sprites through one material in a single batch.`,
      status: '',
    });
  }

  override update(delta: Seconds): void {
    const { width, height } = this.app;
    this.elapsed += delta;

    for (const tile of this.tiles) {
      if (tile.spin !== 0) tile.sprite.rotate(delta * tile.spin);
    }

    for (let index = 0; index < LIGHT_COUNT; index++) {
      const phase = this.elapsed * (0.4 + index * 0.15) + (index * Math.PI) / 2;
      const x = width / 2 + Math.cos(phase) * (width * 0.36);
      const y = height / 2 + Math.sin(phase * 1.3) * (height * 0.36);
      this.lights[index]!.setPosition(x, y);
      this.markers[index]!.setPosition(x, y);
    }
  }

  override draw(context: RenderingContext): void {
    context.render(this.layer);
    this.hud.setStatus(`draw calls ${context.stats.drawCalls}`);
  }
}

const app = new Application({
  scenes: { NormalMappedSpritesScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(14, 14, 20),
});

await app.start(NormalMappedSpritesScene);
