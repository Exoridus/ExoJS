// Auto-generated from radiance-rooms.ts - edit the .ts source, not this file.
import { Application, Color, Container, FixedResolutionCanvasSizing, RepeatingSprite, ScaleModes, Scene, Sprite, Texture } from '@codexo/exojs';
import { Lighting, PointLight, PolygonOccluder, radiance } from '@codexo/exojs-lighting';
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
// The panel controls pause the motion, place the lamp at a reproducible point
// on its own path, switch the bounce off, and show the intermediate fields, so
// two renderers can be compared at the same instant instead of by eye while
// everything moves.
const canvasTexture = (size, paint) => {
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
// A doorway in the middle wall, two pillars in the far room to catch whatever
// comes through it, and one block beside the lamp so the near room has a
// shadow of its own to compare against.
const walls = [
  { x: 640, y: 170, width: 34, height: 300 },
  { x: 640, y: 570, width: 34, height: 260 },
  { x: 880, y: 250, width: 36, height: 36 },
  { x: 1010, y: 470, width: 36, height: 36 },
  { x: 300, y: 560, width: 150, height: 34 },
];
/** Levels the debug cycle walks, in the order it walks them. */
const debugViews = [null, 'light', 'mask', 'distance', 'occluders'];
/** Texels of light field per logical pixel. Stated here so the panel can show what was actually run at. */
const lightResolution = 1;
/**
 * The lamp's own path, as a function of a phase in seconds. One expression, so
 * the paused slider and the running clock place it identically.
 */
const lampAt = phase => ({
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
  world;
  lighting;
  quality = radiance();
  intensity = 3;
  softness = 0.35;
  bounce = true;
  moving = true;
  debug = null;
  elapsed = 0;
  hud;
  phaseControl;
  init() {
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
        this.quality = value ? radiance({ bounce: this.bounce ? 0.5 : 0 }) : 'lightmap';
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
          this.quality = radiance({ bounce: value ? 0.5 : 0 });
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
      options: ['shaded', 'light', 'mask', 'distance', 'occluders'],
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
  update(delta) {
    if (!this.moving) {
      return;
    }
    this.elapsed += delta;
    this.phaseControl.set((this.elapsed % loopSeconds) / loopSeconds);
    // Moving the lamp is the clearest way to see that nothing about the far
    // room is baked: the wedge through the doorway sweeps with it.
    this.moveLamp();
  }
  draw(context) {
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
  moveLamp() {
    const { x, y } = lampAt(this.elapsed);
    this.lamp.setPosition(x, y);
  }
  get lamp() {
    return this.lighting.lights[0];
  }
  /** Build the lighting system for the renderer currently selected. */
  build() {
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
      const halfWidth = wall.width / 2;
      const halfHeight = wall.height / 2;
      this.lighting.occludeFrom(
        new PolygonOccluder([
          { x: wall.x - halfWidth, y: wall.y - halfHeight },
          { x: wall.x + halfWidth, y: wall.y - halfHeight },
          { x: wall.x + halfWidth, y: wall.y + halfHeight },
          { x: wall.x - halfWidth, y: wall.y + halfHeight },
        ]),
      );
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
