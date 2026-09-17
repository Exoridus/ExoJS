// Auto-generated from radiance-rooms.ts - edit the .ts source, not this file.
import { Application, Color, Container, FixedResolutionCanvasSizing, ScaleModes, Scene, Sprite, Texture } from '@codexo/exojs';
import { Lighting, PointLight, polygonOccluder } from '@codexo/exojs-lighting';
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
// The second thing to watch is the source size. `softness` under `radiance` is
// how big the lamp is, so widening it softens every shadow in the scene at
// once, and the penumbra grows with distance from the wall the way a real one
// does.
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
class RadianceRoomsScene extends Scene {
  world;
  lighting;
  quality = 'radiance';
  intensity = 3;
  softness = 0.35;
  elapsed = 0;
  hud;
  init() {
    const { width, height } = this.app;
    this.world = new Container();
    const floor = new Sprite(floorTexture);
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
      hint: 'One lamp, one doorway. Switch the renderer to see the difference between a light that is drawn and light that is transported.',
      status: '',
    });
    const panel = mountControlPanel({ title: 'Lighting', corner: 'top-right' });
    panel.addToggle({
      label: 'Radiance',
      value: true,
      onChange: value => {
        // `quality` resolves once, at construction, so switching renderers means
        // building a new system - which is all a system is here: it owns its
        // passes and takes them out again on `destroy()`.
        this.quality = value ? 'radiance' : 'lightmap';
        this.build();
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
      label: 'Source size',
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
    this.elapsed += delta;
    // Moving the lamp is the clearest way to see that nothing about the far
    // room is baked: the wedge through the doorway sweeps with it.
    this.lamp.setPosition(340 + Math.sin(this.elapsed * 0.3) * 120, 360 + Math.cos(this.elapsed * 0.22) * 150);
  }
  draw(context) {
    context.render(this.world);
    this.hud.setStatus(`${this.lighting.quality} - draw calls ${context.stats.drawCalls}`);
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
      lightResolution: 0.5,
    });
    this.systems.add(this.lighting);
    this.lighting.add(new PointLight({ radius: 600, intensity: this.intensity, softness: this.softness, color: new Color(255, 226, 180) }));
    for (const wall of walls) {
      const halfWidth = wall.width / 2;
      const halfHeight = wall.height / 2;
      this.lighting.occludeFrom(
        polygonOccluder([
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
