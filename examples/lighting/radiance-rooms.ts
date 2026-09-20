import {
  Application,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  type RenderingContext,
  RepeatingSprite,
  ScaleModes,
  Scene,
  type Seconds,
  Sprite,
  Texture,
} from '@codexo/exojs';
import { AlphaOccluder, Lighting, type LightingDebugView, type LightingQualityOption, PointLight, PolygonOccluder, radiance } from '@codexo/exojs-lighting';
import { mountControlPanel, mountControls } from '@examples/runtime';

// Two rooms, one doorway, one lamp - and a switch between the renderer that
// draws a light and the one that transports it.
//
// Under `lightmap` a light is a pool with an edge: it reaches its radius and
// stops, and the wall carves a shadow out of that pool. Under `radiance` the
// lamp fills the room it stands in, the wall leaves the far room dark, and what
// comes through the doorway is a wedge that widens - because nothing is being
// drawn around the light at all. What the field holds is where light ARRIVES.
//
// The second thing to watch is what `softness` means, because it is not the
// same quantity in the two renderers:
//
// - Under `radiance` it is the SOURCE SIZE. The lamp becomes an emitter with a
//   width, so every shadow in the scene softens at once and each penumbra
//   grows with the distance from the wall that casts it, the way a real one
//   does.
// - Under `lightmap` it is FILTER WIDTH. The lamp is still a point; the shadow
//   term is blurred across a fixed fraction of a turn around it, so the
//   penumbra widens with the distance from the LIGHT rather than from the
//   wall, and no shadow ever behaves like one cast by an area source.
//
// The third thing to watch is the BOUNCE, which is what the red panel beside
// the doorway is for. The walls are outlines: they block, and an outline has
// no material to give anything back with. The panel is a drawable the camera
// paints, so the cascades read its own colour where a ray ends on it - switch
// the bounce off and the floor in front of it goes neutral.
//
// The panel controls pause the motion, place the lamp at a reproducible point
// on its own path, switch the bounce off, and show the intermediate fields, so
// two renderers can be compared at the same instant instead of by eye while
// everything moves.

const canvasTexture = (size: number, paint: (context: CanvasRenderingContext2D) => void): Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('2D canvas context unavailable.');
  paint(context);
  return new Texture(canvas, { scaleMode: ScaleModes.Linear, generateMipMap: false });
};

const floorTexture = canvasTexture(64, context => {
  context.fillStyle = '#3b3a36';
  context.fillRect(0, 0, 64, 64);
  context.fillStyle = '#343330';
  context.fillRect(0, 0, 32, 32);
  context.fillRect(32, 32, 32, 32);
});

const stoneTexture = canvasTexture(8, context => {
  context.fillStyle = '#726a5e';
  context.fillRect(0, 0, 8, 8);
});

// Saturated and bright on purpose: what a surface gives back is its own colour
// times what fell on it, so a dark or grey panel returns either nothing worth
// seeing or the lamp's own light again.
const panelTexture = canvasTexture(8, context => {
  context.fillStyle = '#ff3b2f';
  context.fillRect(0, 0, 8, 8);
});

// A mid neutral, where the rest of the floor is dark stone. The bounce is
// multiplied by whatever colour the receiver already has, so a dark floor
// shows a correct bounce as nothing at all - and a near-white one shows it as
// a wash the direct light saturates anyway.
const apronTexture = canvasTexture(8, context => {
  context.fillStyle = '#8d8a82';
  context.fillRect(0, 0, 8, 8);
});

interface Wall {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// A doorway in the middle wall, two pillars in the far room to catch whatever
// comes through it, and one block beside the lamp so the near room has a
// shadow of its own to compare against.
const walls: readonly Wall[] = [
  { x: 640, y: 170, width: 34, height: 300 },
  { x: 640, y: 570, width: 34, height: 260 },
  { x: 880, y: 250, width: 36, height: 36 },
  { x: 1010, y: 470, width: 36, height: 36 },
  { x: 300, y: 560, width: 150, height: 34 },
];

/**
 * The one surface in the scene with a material: a slab across the lamp's side
 * of the doorway, drawn by the camera and occluding as coverage rather than as
 * an outline, so what falls on it comes back off it in its own colour.
 */
const bouncePanel: Wall = { x: 452, y: 400, width: 26, height: 230 };

/**
 * The floor the panel gives its colour back onto: on the lamp's side of it,
 * which is the side a surface re-emits from, and far enough from the lamp that
 * the direct term does not saturate the tint away.
 */
const bounceApron: Wall = { x: 360, y: 400, width: 150, height: 250 };

/** A wall's own box, as the four corners an occluder takes. */
const outline = (wall: Wall): readonly { x: number; y: number }[] => {
  const halfWidth = wall.width / 2;
  const halfHeight = wall.height / 2;

  return [
    { x: wall.x - halfWidth, y: wall.y - halfHeight },
    { x: wall.x + halfWidth, y: wall.y - halfHeight },
    { x: wall.x + halfWidth, y: wall.y + halfHeight },
    { x: wall.x - halfWidth, y: wall.y + halfHeight },
  ];
};

/**
 * What the bounce toggle switches on, rather than the renderer's own default
 * of `0.5`. The panel returns its colour once, across a room, onto a floor the
 * lamp already lights directly; at the default the tint is a couple of counts
 * and the toggle reads as doing nothing.
 */
const bounceFactor = 0.9;

/** Levels the debug cycle walks, in the order it walks them. */
const debugViews: readonly LightingDebugView[] = [null, 'light', 'mask', 'occluders'];

/** Texels of light field per logical pixel. Stated here so the panel can show what was actually run at. */
const lightResolution = 1;

/**
 * The lamp's own path, as a function of a phase in seconds. One expression, so
 * the paused slider and the running clock place it identically.
 */
const lampAt = (phase: number): { x: number; y: number } => ({
  x: 340 + Math.sin(phase * 0.3) * 120,
  y: 360 + Math.cos(phase * 0.22) * 150,
});

/**
 * Seconds for one full loop of BOTH terms, so a phase slider covers the whole
 * path and the same phase is always the same place. The two rates are 0.3 and
 * 0.22, whose common period is `2 * pi` over their greatest common measure of
 * 0.02 - not over their difference.
 */
const loopSeconds = (Math.PI * 2) / 0.02;

/** Where the status line reads the lamp's real position into. */
const lampPosition = { x: 0, y: 0 };

class RadianceRoomsScene extends Scene {
  private world!: Container;
  private panel!: Sprite;
  private lighting!: Lighting;
  private quality: LightingQualityOption = radiance({ bounce: bounceFactor });
  private intensity = 3;
  private softness = 0.35;
  private bounce = true;
  private moving = true;
  private debug: LightingDebugView = null;
  private elapsed = 0;
  private hud!: ReturnType<typeof mountControls>;
  private phaseControl!: { set(value: number): void };

  override init(): void {
    const { width, height } = this.app;

    this.world = new Container();

    // Repeated, not stretched: a 64px tile scaled to the whole canvas turns its
    // own checker into two quadrant-sized blocks whose edges read as a defect
    // in the light rather than as a floor.
    const floor = new RepeatingSprite(floorTexture);

    floor.width = width;
    floor.height = height;
    this.world.addChild(floor);

    for (const wall of walls) {
      const sprite = new Sprite(stoneTexture).setAnchor(0.5);

      sprite.width = wall.width;
      sprite.height = wall.height;
      sprite.setPosition(wall.x, wall.y);
      this.world.addChild(sprite);
    }

    const apron = new Sprite(apronTexture).setAnchor(0.5);

    apron.width = bounceApron.width;
    apron.height = bounceApron.height;
    apron.setPosition(bounceApron.x, bounceApron.y);
    this.world.addChild(apron);

    this.panel = new Sprite(panelTexture).setAnchor(0.5);
    this.panel.width = bouncePanel.width;
    this.panel.height = bouncePanel.height;
    this.panel.setPosition(bouncePanel.x, bouncePanel.y);
    this.world.addChild(this.panel);

    this.build();

    this.hud = mountControls({
      title: 'Radiance Rooms',
      hint: 'One lamp, one doorway. Switch the renderer to see the difference between a light that is drawn and light that is transported - they are different transport models and will not agree pixel for pixel. Pause the motion and set a phase to compare the two at the same instant.',
      status: '',
    });

    const panel = mountControlPanel({ title: 'Lighting', corner: 'top-right' });

    panel.addToggle({
      label: 'Radiance',
      value: true,
      onChange: value => {
        // `quality` resolves once, at construction, so switching renderers means
        // building a new system - which is all a system is here: it owns its
        // passes and takes them out again on `destroy()`. `radiance` is a value
        // rather than a name because that is what lets a project that never
        // uses it leave the cascades out of its bundle.
        this.quality = value ? radiance({ bounce: this.bounce ? bounceFactor : 0 }) : 'lightmap';
        this.build();
      },
    });

    panel.addToggle({
      label: 'Bounce',
      value: this.bounce,
      onChange: value => {
        this.bounce = value;

        // Only the cascades bounce; under the quads the toggle has nothing to
        // rebuild.
        if (typeof this.quality === 'object') {
          this.quality = radiance({ bounce: value ? bounceFactor : 0 });
          this.build();
        }
      },
    });

    panel.addToggle({
      label: 'Motion',
      value: this.moving,
      onChange: value => {
        this.moving = value;
      },
    });

    this.phaseControl = panel.addSlider({
      label: 'Phase',
      min: 0,
      max: 1,
      // A step is a step along the PATH, and the path is `loopSeconds` long:
      // at this rate one is about ten pixels of lamp, which is what makes the
      // slider a way to place the lamp rather than to jump it across the room.
      step: 0.001,
      value: 0,
      onChange: value => {
        // Placing the lamp by hand is what makes a comparison reproducible:
        // the same phase is the same position in either renderer, however long
        // either has been running.
        this.elapsed = value * loopSeconds;
        this.moveLamp();
      },
    });

    panel.addCycle({
      label: 'Field',
      options: ['shaded', 'light', 'mask', 'occluders'],
      index: 0,
      onChange: index => {
        this.debug = debugViews[index] ?? null;
        this.lighting.debug = this.debug;
      },
    });

    panel.addSlider({
      label: 'Lamp',
      min: 0.5,
      max: 6,
      step: 0.1,
      value: this.intensity,
      onChange: value => {
        this.intensity = value;
        this.lamp.intensity = value;
      },
    });

    panel.addSlider({
      // Source size under radiance, filter width under lightmap. See the note
      // at the top of the file: the two are not the same quantity, and the
      // slider is labelled for neither so that the difference stays visible.
      label: 'Softness',
      min: 0,
      max: 1,
      step: 0.05,
      value: this.softness,
      onChange: value => {
        this.softness = value;
        this.lamp.softness = value;
      },
    });
  }

  override update(delta: Seconds): void {
    if (!this.moving) {
      return;
    }

    this.elapsed += delta;
    this.phaseControl.set((this.elapsed % loopSeconds) / loopSeconds);
    // Moving the lamp is the clearest way to see that nothing about the far
    // room is baked: the wedge through the doorway sweeps with it.
    this.moveLamp();
  }

  override draw(context: RenderingContext): void {
    context.render(this.world);

    // Read off the lamp itself, not recomputed from the clock: the status line
    // is what says two renderers were compared under the same conditions, so
    // it has to report where the light actually is.
    this.lamp.getWorldPosition(lampPosition);
    const bounce = typeof this.quality === 'object' && this.bounce ? 'bounce' : 'no bounce';

    this.hud.setStatus(
      `${this.lighting.quality} - ${bounce} - ${this.app.width}x${this.app.height} at ${lightResolution}x - lamp ${lampPosition.x.toFixed(1)}, ${lampPosition.y.toFixed(1)} - draw calls ${context.stats.drawCalls}`,
    );
  }

  private moveLamp(): void {
    const { x, y } = lampAt(this.elapsed);

    this.lamp.setPosition(x, y);
  }

  private get lamp(): PointLight {
    return this.lighting.lights[0] as PointLight;
  }

  /** Build the lighting system for the renderer currently selected. */
  private build(): void {
    if (this.lighting !== undefined) {
      this.systems.remove(this.lighting);
      this.lighting.destroy();
    }

    this.lighting = new Lighting({
      quality: this.quality,
      app: this.app,
      ambient: new Color(10, 11, 16),
      lightResolution,
    });
    this.lighting.debug = this.debug;
    this.systems.add(this.lighting);
    this.lighting.add(new PointLight({ radius: 600, intensity: this.intensity, softness: this.softness, color: new Color(255, 226, 180) }));
    // Placed straight away rather than on the next tick: switching renderer
    // while the motion is paused would otherwise leave the new lamp at the
    // origin, and the A/B this scene exists for would compare two different
    // scenes.
    this.moveLamp();

    for (const wall of walls) {
      this.lighting.occludeFrom(new PolygonOccluder(outline(wall)));
    }

    // The panel is the drawable one, and only under the cascades: they take a
    // drawable as the coverage it paints and read its colour back out of the
    // frame, which is what a bounce is. The quads walk segments instead, so
    // there the same slab is registered as the outline of its own box - it
    // still casts, it just has nothing to give back.
    if (typeof this.quality === 'object') {
      this.lighting.occludeFrom(new AlphaOccluder(this.panel));
    } else {
      this.lighting.occludeFrom(new PolygonOccluder(outline(bouncePanel)));
    }
  }
}

const app = new Application({
  scenes: { RadianceRoomsScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(3, 4, 7),
});

await app.start(RadianceRoomsScene);
