import {
  Application,
  Color,
  Container,
  type InteractionEvent,
  Keyboard,
  type Pointer,
  RepeatingSprite,
  ResponsiveCanvasSizing,
  ScaleModes,
  Scene,
  type Seconds,
  Sprite,
  Texture,
} from '@codexo/exojs';
import { AlphaOccluder, LightmapLighting, PointLight, SpotLight } from '@codexo/exojs/lighting';
import { choice, demoPanel, slider, startExample, toggle } from '@examples/runtime';

const canvasTexture = (width: number, height: number, paint: (context: CanvasRenderingContext2D) => void): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (context === null) {
    throw new Error('2D canvas context unavailable.');
  }

  paint(context);

  return canvas;
};

const floorCanvas = canvasTexture(64, 64, context => {
  context.fillStyle = '#777b82';
  context.fillRect(0, 0, 64, 64);
  context.fillStyle = '#6b7078';
  context.fillRect(0, 0, 32, 32);
  context.fillRect(32, 32, 32, 32);
});

const wallCanvas = canvasTexture(8, 8, context => {
  context.fillStyle = '#ece3d2';
  context.fillRect(0, 0, 8, 8);
});

// A cross, so the traced outline is visibly NOT the sprite's bounding box.
const pillarSize = 96;
const pillarCanvas = canvasTexture(pillarSize, pillarSize, context => {
  const arm = pillarSize / 3;
  context.fillStyle = '#ead3a4';
  context.fillRect(arm, 0, arm, pillarSize);
  context.fillRect(0, arm, pillarSize, arm);
});

const controls = {
  radius: slider('Radius', { min: 80, max: 360, step: 10, value: 310 }),
  softness: slider('Softness', { min: 0, max: 1, step: 0.05, value: 0.35 }),
  occluders: toggle('Show occluders'),
  type: choice('Light', ['Point', 'Spot']),
};
class ShadowCastersScene extends Scene {
  private readonly world = new Container();
  private lighting!: LightmapLighting;
  private torch!: PointLight;
  private beam!: SpotLight;
  private turntable!: Sprite;
  private panel!: ReturnType<typeof demoPanel<typeof controls>>;
  private elapsed = 0;
  private playing = true;
  private dragPointer: number | null = null;
  private lightX = 0.47;
  private lightY = 0.58;
  private scale = 1;
  private width = 1280;
  private height = 600;
  private walls: Sprite[] = [];

  override init(): void {
    const floor = new RepeatingSprite(this.track(new Texture(floorCanvas, { scaleMode: ScaleModes.Linear })));
    this.world.addChild(floor);
    const wallTexture = this.track(new Texture(wallCanvas));
    const pillarTexture = this.track(new Texture(pillarCanvas));
    this.lighting = new LightmapLighting(this.app, { scene: this, ambient: new Color(82, 87, 100), lightResolution: 1 });
    this.systems.add(this.lighting);

    for (let i = 0; i < 3; i++) {
      const piece = new Sprite(i === 1 ? pillarTexture : wallTexture).setAnchor(0.5);
      this.walls.push(piece);
      this.world.addChild(piece);
      this.lighting.occludeFrom(new AlphaOccluder(piece));
    }

    this.turntable = this.walls[2];
    this.root.addChild(this.world);
    this.torch = this.track(
      this.lighting.add(new PointLight({ radius: 500, intensity: 2.1, softness: 0.35, color: new Color(255, 210, 160) })),
    );
    this.beam = this.track(
      this.lighting.add(
        new SpotLight({ radius: 500, angle: 40, coneSoftness: 0.35, intensity: 0, softness: 0.35, color: new Color(255, 210, 160) }),
      ),
    );
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls,
      actions: {
        'Pause / Resume': () => {
          this.playing = !this.playing;
        },
      },
    });
    this.inputs.onTrigger(Keyboard.Space, () => {
      this.playing = !this.playing;
    });
    // Hit-tested scene input respects the UI layer, including open control menus.
    this.root.interactive = true;
    this.root.onPointerDown.add(this.onDown);
    this.app.input.onPointerMove.add(this.onMove);
    this.app.input.onPointerUp.add(this.onUp);
    this.app.input.onPointerCancel.add(this.onUp);
    window.addEventListener('pointerup', this.onWindowEnd);
    window.addEventListener('blur', this.onBlur);
    this.onSuspend.add(this.onBlur);
  }

  private readonly onDown = (event: InteractionEvent): void => {
    if (event.button !== 0 || this.dragPointer !== null) {
      return;
    }

    this.dragPointer = event.pointer.id;
    this.onMove(event.pointer, event.x, event.y);
  };
  private readonly onMove = (pointer: Pointer, x: number, y: number): void => {
    if (pointer.id === this.dragPointer) {
      this.lightX = Math.max(0, Math.min(1, x / this.scale / this.width));
      this.lightY = Math.max(0, Math.min(1, y / this.scale / this.height));
    }
  };
  private readonly onUp = (pointer: Pointer): void => {
    if (pointer.id === this.dragPointer) {
      this.onBlur();
    }
  };
  private readonly onWindowEnd = (event: PointerEvent): void => {
    if (event.pointerId === this.dragPointer) {
      this.onBlur();
    }
  };
  private readonly onBlur = (): void => {
    this.dragPointer = null;
  };

  override update(delta: Seconds): void {
    // This layout uses top-left coordinates even as the host changes aspect.
    this.app.rendering.view.setCenter(this.app.width / 2, this.app.height / 2);
    const v = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.scale = v.scale;
    this.width = v.width;
    this.height = v.contentHeight;
    this.root.setScale(v.scale);
    const floor = this.world.children[0] as Sprite;
    floor.width = v.width;
    floor.height = v.contentHeight;

    if (this.playing) {
      this.elapsed += delta;
    }

    this.walls[0].setPosition(v.width * 0.48, v.contentHeight * 0.27);
    this.walls[0].width = v.width * 0.3;
    this.walls[0].height = 12;
    this.walls[1].setPosition(v.width * 0.58, v.contentHeight * 0.63).setScale(Math.min(1, v.contentHeight / 270));
    this.walls[2].setPosition(v.width * 0.8, v.contentHeight * 0.4);
    this.walls[2].width = v.width * 0.2;
    this.walls[2].height = 12;
    this.turntable.rotation = this.elapsed * 22;

    for (const light of [this.torch, this.beam]) {
      light.setPosition(this.lightX * v.width * v.scale, this.lightY * v.contentHeight * v.scale);
      light.radius = this.panel.values.radius * v.scale;
      light.softness = this.panel.values.softness;
    }

    this.torch.intensity = this.panel.values.type === 'Point' ? 2.1 : 0;
    this.beam.intensity = this.panel.values.type === 'Spot' ? 2.1 : 0;
    this.beam.rotation = 0;
    this.lighting.debug = this.panel.values.occluders ? 'occluders' : null;
    this.panel.status(
      `Drag the scene | ${this.panel.values.type} light | ${this.playing ? 'wall rotating' : 'paused'} | rectangle and alpha-cross cast real shadows`,
    );
  }

  override destroy(): void {
    this.onBlur();
    this.app.input.onPointerMove.remove(this.onMove);
    this.app.input.onPointerUp.remove(this.onUp);
    this.app.input.onPointerCancel.remove(this.onUp);
    window.removeEventListener('pointerup', this.onWindowEnd);
    window.removeEventListener('blur', this.onBlur);
  }
}

const app = new Application({
  scenes: { ShadowCastersScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new ResponsiveCanvasSizing({ minAspect: 1 }) },
  clearColor: new Color(6, 7, 12),
});
await startExample(app, () => app.start(ShadowCastersScene));
