// Auto-generated from radiance-rooms.ts - edit the .ts source, not this file.
import {
  Application,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  Keyboard,
  RepeatingSprite,
  ScaleModes,
  Scene,
  Sprite,
  Texture,
} from '@codexo/exojs';
import { AlphaOccluder, LightmapLighting, PointLight, PolygonOccluder, RadianceLighting } from '@codexo/exojs/lighting';
import { choice, demoPanel, slider, toggle } from '@examples/runtime';
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
const canvasTexture = (size, paint) => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('2D canvas context unavailable.');
  }
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
/**
 * The one surface in the scene with a material: a slab across the lamp's side
 * of the doorway, drawn by the camera and occluding as coverage rather than as
 * an outline, so what falls on it comes back off it in its own colour.
 */
const bouncePanel = { x: 452, y: 400, width: 26, height: 230 };
/**
 * The floor the panel gives its colour back onto: on the lamp's side of it,
 * which is the side a surface re-emits from, and far enough from the lamp that
 * the direct term does not saturate the tint away.
 */
const bounceApron = { x: 360, y: 400, width: 150, height: 250 };
/** A wall's own box, as the four corners an occluder takes. */
const outline = wall => {
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
class RadianceRoomsScene extends Scene {
  world;
  panel;
  lighting;
  cascading = true;
  intensity = 3;
  softness = 0.35;
  bounce = true;
  moving = true;
  elapsed = 0;
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
    // A renderer is chosen by constructing it, so switching means building a
    // new system - which is all a system is here: it owns its passes and takes
    // them out again on `destroy()`. Importing the class is also what links it,
    // so a project that only ever builds one leaves the other out of its bundle.
    // Space pauses the lamp, so both renderers can be compared at one instant.
    const panel = demoPanel({
      scene: this,
      corner: 'top-right',
      controls: {
        renderer: choice('Renderer', ['Radiance', 'Lightmap']),
        bounce: toggle('Bounce', this.bounce),
        moving: toggle('Motion', this.moving),
        lamp: slider('Lamp', { min: 0.5, max: 6, step: 0.1, value: this.intensity, format: v => v.toFixed(1) }),
        // Source size under radiance, filter width under lightmap. See the
        // note at the top of the file: the two are not the same quantity.
        softness: slider('Softness', { min: 0, max: 1, step: 0.05, value: this.softness }),
      },
      onChange: (_key, _value, values) => {
        this.moving = values.moving;
        this.intensity = values.lamp;
        this.softness = values.softness;
        // Only the cascades bounce; under the quads the toggle changes nothing.
        this.build(values.renderer === 'Radiance', values.bounce);
        this.lamp.intensity = this.intensity;
        this.lamp.softness = this.softness;
      },
    });
    this.inputs.onTrigger(Keyboard.Space, () => panel.step('moving'));
  }
  update(delta) {
    if (!this.moving) {
      return;
    }
    this.elapsed += delta;
    // Moving the lamp is the clearest way to see that nothing about the far
    // room is baked: the wedge through the doorway sweeps with it.
    this.moveLamp();
  }
  draw(context) {
    context.render(this.world);
  }
  moveLamp() {
    const { x, y } = lampAt(this.elapsed);
    this.lamp.setPosition(x, y);
  }
  get lamp() {
    return this.lighting.lights[0];
  }
  /** Builds the lighting system for the selected renderer, unless it is already the one running. */
  build(cascading, bounce) {
    if (this.lighting !== undefined && cascading === this.cascading && (bounce === this.bounce || !cascading)) {
      return;
    }
    this.cascading = cascading;
    this.bounce = bounce;
    if (this.lighting !== undefined) {
      this.systems.remove(this.lighting);
      this.lighting.destroy();
    }
    const options = { ambient: new Color(10, 11, 16), lightResolution };
    this.lighting = this.cascading
      ? new RadianceLighting(this.app, { ...options, bounce: this.bounce ? bounceFactor : 0 })
      : new LightmapLighting(this.app, options);
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
    if (this.cascading) {
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
