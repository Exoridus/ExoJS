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
  WrapModes,
} from '@codexo/exojs';
import { AlphaOccluder, Lighting, LightmapLighting, LineLight, PointLight, SpotLight, SunLight } from '@codexo/exojs-lighting';
import { mountControlPanel, mountControls } from '@examples/runtime';

// Four light shapes, one scene, and the shape of the light doing the work that
// a texture would otherwise have to do.
//
// A cookie is one texture slot on the light: its full 0..1 lies on the light's
// own bounding square, so the pattern turns with a cone and scales with a
// radius. Nothing is projected, nothing is authored per wall - the window bars
// below are a 128x128 canvas carried by the lamp that casts them.
//
// The sun is the one shape that is not a pool of light: it has a direction and
// no position, so its shadows are parallel and it reaches whatever the camera
// can see.

const canvasTexture = (size: number, paint: (context: CanvasRenderingContext2D) => void, wrap = WrapModes.ClampToEdge): Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('2D canvas context unavailable.');
  }
  paint(context);
  return new Texture(canvas, { scaleMode: ScaleModes.Linear, wrapMode: wrap, generateMipMap: false });
};

const floorTexture = canvasTexture(64, context => {
  context.fillStyle = '#4a4740';
  context.fillRect(0, 0, 64, 64);
  context.fillStyle = '#413e38';
  context.fillRect(0, 0, 32, 32);
  context.fillRect(32, 32, 32, 32);
});

// A window: bars of shadow across an otherwise open pane. Transparent where the
// light is blocked, because a cookie multiplies rather than adds.
const windowCookie = canvasTexture(128, context => {
  context.clearRect(0, 0, 128, 128);
  context.fillStyle = '#ffffff';
  context.fillRect(10, 10, 108, 108);
  context.globalCompositeOperation = 'destination-out';
  context.fillRect(60, 10, 8, 108);
  context.fillRect(10, 60, 108, 8);
});

// Leaf shade for the spot: a scatter of holes, so the cone reads as light
// falling through a canopy rather than as a cone.
const canopyCookie = canvasTexture(128, context => {
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 128, 128);
  context.globalCompositeOperation = 'destination-out';

  for (let index = 0; index < 60; index++) {
    const angle = index * 2.399963;
    const distance = Math.sqrt(index / 60) * 58;

    context.beginPath();
    context.arc(64 + Math.cos(angle) * distance, 64 + Math.sin(angle) * distance, 5 + (index % 4) * 2.5, 0, Math.PI * 2);
    context.fill();
  }
});

const blockTexture = canvasTexture(8, context => {
  context.fillStyle = '#6d675d';
  context.fillRect(0, 0, 8, 8);
});

const block = (x: number, y: number, width: number, height: number): Sprite => {
  const sprite = new Sprite(blockTexture).setAnchor(0.5);

  sprite.width = width;
  sprite.height = height;
  sprite.setPosition(x, y);

  return sprite;
};

class LightCookiesScene extends Scene {
  private world!: Container;
  private lighting!: Lighting;
  private sun!: SunLight;
  private window!: PointLight;
  private canopy!: SpotLight;
  private tube!: LineLight;
  private elapsed = 0;
  private hud!: ReturnType<typeof mountControls>;

  override init(): void {
    const { width, height } = this.app;

    this.world = new Container();
    this.lighting = new LightmapLighting(this.app, { ambient: new Color(16, 18, 28), lightResolution: 1 });
    this.systems.add(this.lighting);

    const floor = new Sprite(floorTexture);

    floor.width = width;
    floor.height = height;
    this.world.addChild(floor);

    // Two pillars, so the sun has something to throw a parallel shadow from.
    for (const [x, y] of [
      [430, 250],
      [430, 470],
    ] as const) {
      const pillar = block(x, y, 36, 130);

      this.world.addChild(pillar);
      // The pillar's own silhouette, taken from the pillar. A polygon placed by
      // `{ node: pillar }` would be in the pillar's LOCAL space - eight texels
      // across, because a sized sprite carries its size as a scale - so points
      // written at the size it appears at come out scaled a second time.
      this.lighting.occludeFrom(new AlphaOccluder(pillar));
    }

    // Directional: no position, no falloff, parallel shadows. It travels along
    // the node's rotation, so the time of day below is one number.
    this.sun = this.lighting.add(new SunLight({ intensity: 0.55, softness: 0.05, color: new Color(255, 236, 205) }));
    this.sun.rotation = 20;

    // A point light wearing a window. The bars are the cookie, not geometry -
    // nothing in the scene knows they exist.
    //
    // A cookie is a mask the LIGHT carries, so it turns, scales and travels
    // with the light. This one drifts, which is what shows that: the bars move
    // with the lamp rather than staying on the floor the way a real window's
    // would. A pattern anchored to the world is a projection, and that is a
    // different feature.
    this.window = this.lighting.add(new PointLight({ radius: 300, intensity: 2.4, softness: 0.05, color: new Color(255, 214, 160), cookie: windowCookie }));
    this.window.setPosition(880, 240);

    // The same slot on a cone: the pattern turns with the light.
    this.canopy = this.lighting.add(
      new SpotLight({ radius: 420, angle: 34, coneSoftness: 0.4, intensity: 2.2, softness: 0.05, color: new Color(186, 255, 198), cookie: canopyCookie }),
    );
    this.canopy.setPosition(960, 620);

    // No cookie, a different shape: falloff is measured from the segment, so
    // the pool is a capsule - which is what a tube of neon actually looks like.
    this.tube = this.lighting.add(new LineLight({ length: 260, radius: 64, intensity: 2.6, softness: 0.05, color: new Color(120, 190, 255) }));
    this.tube.setPosition(300, 640);

    this.hud = mountControls({
      title: 'Light Cookies',
      hint: 'Every pattern here is one texture on ONE light, carried by that light - it turns and scales with the lamp rather than being projected onto the world. Watch the window drift: its bars travel with the lamp instead of staying put on the floor, which is exactly the difference between a cookie and a world projection.',
      status: '',
    });

    const panel = mountControlPanel({ title: 'Lights', corner: 'top-right' });

    panel.addSlider({
      label: 'Time of day',
      min: -60,
      max: 60,
      step: 1,
      value: this.sun.rotation,
      onChange: value => {
        this.sun.rotation = value;
      },
    });

    panel.addSlider({
      label: 'Sun',
      min: 0,
      max: 1.2,
      step: 0.05,
      value: this.sun.intensity,
      onChange: value => {
        this.sun.intensity = value;
      },
    });

    panel.addToggle({
      label: 'Cookies',
      value: true,
      onChange: value => {
        this.window.cookie = value ? windowCookie : null;
        this.canopy.cookie = value ? canopyCookie : null;
      },
    });
  }

  override update(delta: Seconds): void {
    this.elapsed += delta;

    // Aiming a cone is rotating it, and the cookie turns with it.
    // Counter-clockwise from +x, so up the screen is +90 and not -90: the
    // world's y grows downward while an angle still turns the way an angle
    // turns.
    this.canopy.rotation = 90 + Math.sin(this.elapsed * 0.35) * 20;
    this.tube.rotation = Math.sin(this.elapsed * 0.25) * 12;
    this.window.setPosition(880, 240 + Math.sin(this.elapsed * 0.6) * 40);
  }

  override draw(context: RenderingContext): void {
    context.render(this.world);
    this.hud.setStatus(`${this.lighting.activeLightCount} lights - draw calls ${context.stats.drawCalls}`);
  }
}

const app = new Application({
  scenes: { LightCookiesScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(4, 5, 9),
});

await app.start(LightCookiesScene);
