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
import { Lighting, Occluders, PointLight, SpotLight } from '@codexo/exojs-lighting';
import { mountControlPanel, mountControls } from '@examples/runtime';

// Nothing here models a shadow. Each wall registers the outline it already
// has - its own rectangle, or, for the pillar, the silhouette traced out of
// its alpha channel - and the lightmap renderer turns that into a shadow for
// every light on screen, in one instanced draw.
//
// `softness` is a property of the light, not a second pass: it widens the
// shadow sample kernel, so the slider below costs nothing per light.

const canvasTexture = (width: number, height: number, paint: (context: CanvasRenderingContext2D) => void): Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('2D canvas context unavailable.');
  paint(context);
  return new Texture(canvas, { scaleMode: ScaleModes.Linear, generateMipMap: false });
};

const floorTexture = canvasTexture(64, 64, context => {
  context.fillStyle = '#b3aea5';
  context.fillRect(0, 0, 64, 64);
  context.fillStyle = '#a19c94';
  context.fillRect(0, 0, 32, 32);
  context.fillRect(32, 32, 32, 32);
});

const wallTexture = canvasTexture(8, 8, context => {
  context.fillStyle = '#cfc9be';
  context.fillRect(0, 0, 8, 8);
});

// A cross, so the traced outline is visibly NOT the sprite's bounding box.
const pillarSize = 96;
const pillarTexture = canvasTexture(pillarSize, pillarSize, context => {
  const arm = pillarSize / 3;
  context.fillStyle = '#d8cbb0';
  context.fillRect(arm, 0, arm, pillarSize);
  context.fillRect(0, arm, pillarSize, arm);
});

interface Wall {
  readonly sprite: Sprite;
  readonly width: number;
  readonly height: number;
}

const wall = (x: number, y: number, width: number, height: number): Wall => {
  const sprite = new Sprite(wallTexture).setAnchor(0.5);

  sprite.width = width;
  sprite.height = height;
  sprite.setPosition(x, y);
  sprite.tint = new Color(150, 146, 138);

  return { sprite, width, height };
};

class ShadowCastersScene extends Scene {
  private world!: Container;
  private lighting!: Lighting;
  private torch!: PointLight;
  private beam!: SpotLight;
  private turntable!: Wall;
  private elapsed = 0;
  private hud!: ReturnType<typeof mountControls>;

  override init(): void {
    const { width, height } = this.app;

    this.world = new Container();
    this.lighting = new Lighting({
      quality: 'lightmap',
      app: this.app,
      ambient: new Color(34, 36, 50),
      lightResolution: 1,
    });
    this.systems.add(this.lighting);

    const floor = new Sprite(floorTexture);

    floor.width = width;
    floor.height = height;
    this.world.addChild(floor);

    // Static level geometry: each wall hands over the rectangle it is drawn as,
    // in its own local space, so the outline follows the sprite's transform.
    const walls = [wall(320, 200, 360, 28), wall(940, 250, 28, 320), wall(520, 560, 300, 28)];

    this.turntable = wall(880, 560, 220, 24);
    walls.push(this.turntable);

    for (const piece of walls) {
      const half = { x: piece.width / 2, y: piece.height / 2 };

      this.world.addChild(piece.sprite);
      this.lighting.occludeFrom(
        Occluders.fromPolygon(
          [
            { x: -half.x, y: -half.y },
            { x: half.x, y: -half.y },
            { x: half.x, y: half.y },
            { x: -half.x, y: half.y },
          ],
          { node: piece.sprite },
        ),
      );
    }

    // The pillar describes nothing at all: its silhouette is traced out of the
    // alpha channel once, here, and never again.
    const pillar = new Sprite(pillarTexture).setAnchor(0.5).setPosition(640, 380);

    this.world.addChild(pillar);
    this.lighting.occludeFrom(Occluders.fromAlpha(pillarTexture, { node: pillar, anchor: pillar.anchor, simplify: 2 }));

    this.torch = this.lighting.add(new PointLight({ radius: 520, intensity: 2.1, softness: 0.35, color: new Color(255, 196, 140) }));
    this.beam = this.lighting.add(
      new SpotLight({ radius: 760, angle: 28, coneSoftness: 0.35, intensity: 2.3, softness: 0.2, color: new Color(150, 210, 255) }),
    );
    this.beam.setPosition(120, 660);

    this.hud = mountControls({
      title: 'Shadow Casters',
      hint: 'No object declares that it casts a shadow. The walls hand over the rectangle they are drawn as; the cross hands over the outline traced from its alpha channel.',
      status: '',
    });

    const panel = mountControlPanel({ title: 'Shadows', corner: 'top-right' });

    panel.addSlider({
      label: 'Softness',
      min: 0,
      max: 1,
      step: 0.05,
      value: this.torch.softness,
      onChange: value => {
        this.torch.softness = value;
        this.beam.softness = value;
      },
    });

    panel.addToggle({
      label: 'Show occluders',
      value: false,
      onChange: value => {
        this.lighting.debug = value ? 'occluders' : null;
      },
    });
  }

  override update(delta: Seconds): void {
    this.elapsed += delta;

    this.torch.setPosition(640 + Math.cos(this.elapsed * 0.55) * 250, 360 + Math.sin(this.elapsed * 0.83) * 150);
    // Aiming a spot is rotating it, so the beam sweeps by turning its node.
    this.beam.rotation = -55 + Math.sin(this.elapsed * 0.4) * 35;
    // A moving occluder needs no bookkeeping: the outline is local to the node.
    this.turntable.sprite.rotation = this.elapsed * 22;
  }

  override draw(context: RenderingContext): void {
    context.render(this.world);
    this.hud.setStatus(`${this.lighting.activeLightCount} lights - draw calls ${context.stats.drawCalls}`);
  }
}

const app = new Application({
  scenes: { ShadowCastersScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(6, 7, 12),
});

await app.start(ShadowCastersScene);
