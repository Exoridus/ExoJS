// Auto-generated from lightmap-normals.ts - edit the .ts source, not this file.
import { Application, Color, Container, FixedResolutionCanvasSizing, Keyboard, ScaleModes, Scene, Sprite, Texture } from '@codexo/exojs';
import { AlphaNormals, LightmapLighting, PointLight } from '@codexo/exojs/lighting';
import { demoPanel, slider, toggle } from '@examples/runtime';
const canvasTexture = (width, height, paint) => {
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
  context.fillStyle = '#3b3a37';
  context.fillRect(0, 0, 64, 64);
  context.fillStyle = '#353431';
  context.fillRect(0, 0, 32, 32);
  context.fillRect(32, 32, 32, 32);
});
// A cobble: opaque in the middle, transparent at the rim. The alpha gradient is
// the whole input the derived normals have, and it is enough to give the stone
// an edge that turns away from the light.
const cobbleSize = 96;
const cobbleCanvas = canvasTexture(cobbleSize, cobbleSize, context => {
  const gradient = context.createRadialGradient(
    cobbleSize / 2,
    cobbleSize / 2,
    cobbleSize * 0.12,
    cobbleSize / 2,
    cobbleSize / 2,
    cobbleSize * 0.48,
  );
  gradient.addColorStop(0, 'rgba(198, 190, 176, 1)');
  gradient.addColorStop(0.72, 'rgba(176, 168, 154, 1)');
  gradient.addColorStop(1, 'rgba(150, 142, 128, 0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(cobbleSize / 2, cobbleSize / 2, cobbleSize * 0.48, 0, Math.PI * 2);
  context.fill();
});
const controls = {
  height: slider('Light height', { min: 8, max: 160, step: 2, value: 34 }),
  normals: toggle('Normals A/B', true),
  debug: toggle('Show normals'),
};
class LightmapNormalsScene extends Scene {
  world = new Container();
  lighting;
  normals;
  lights = [];
  cobbles = [];
  panel;
  lightX = 0.5;
  lightY = 0.5;
  scale = 1;
  width = 1280;
  height = 600;
  init() {
    const floor = new Sprite(this.track(new Texture(floorCanvas, { scaleMode: ScaleModes.Linear })));
    this.world.addChild(floor);
    const texture = this.track(new Texture(cobbleCanvas, { scaleMode: ScaleModes.Linear }));
    // One alpha-derived source is shared by all stones; its normal texture is numeric data, not color.
    this.normals = new AlphaNormals(texture);
    this.track(this.normals.texture);
    this.lighting = new LightmapLighting(this.app, { ambient: new Color(30, 31, 38), lightResolution: 1 });
    this.systems.add(this.lighting);
    for (let side = 0; side < 2; side++) {
      for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 3; column++) {
          const cobble = new Sprite(texture).setAnchor(0.5);
          cobble.rotation = (row * 23 + column * 31) % 360;
          this.cobbles.push(cobble);
          this.world.addChild(cobble);
        }
      }
    }
    for (let side = 0; side < 2; side++) {
      this.lights.push(this.lighting.add(new PointLight({ radius: 300, intensity: 2.4, height: 34, color: new Color(255, 210, 160) })));
    }
    this.root.addChild(this.world);
    this.panel = demoPanel({
      title: 'Light a Normal-Mapped Surface',
      layout: 'bar',
      controls,
      hint: 'Left: alpha-derived normals. Right: no normal registration. Shared local light coordinates are mirrored into both halves.',
      actions: {
        Reset: () => this.reset(),
      },
    });
    this.inputs.onTrigger(Keyboard.Space, () => this.panel.step('normals'));
    this.inputs.onTrigger(Keyboard.R, () => this.reset());
    this.app.input.onPointerMove.add(this.onMove);
  }
  reset() {
    this.lightX = 0.5;
    this.lightY = 0.5;
    this.panel.set('height', 34);
    this.panel.set('normals', true);
    this.panel.set('debug', false);
  }
  onMove = p => {
    this.lightX = ((p.x / this.scale) % (this.width / 2)) / (this.width / 2);
    this.lightY = Math.max(0, Math.min(1, p.y / this.scale / this.height));
  };
  update() {
    const v = this.panel.fit(this.app, this.app.canvas);
    this.scale = v.scale;
    this.width = v.width;
    this.height = v.contentHeight;
    this.root.setScale(v.scale);
    const floor = this.world.children[0];
    floor.width = v.width;
    floor.height = v.contentHeight;
    this.lighting.clearSurfaces();
    this.cobbles.forEach((cobble, index) => {
      const side = Math.floor(index / 9);
      const local = index % 9;
      const column = local % 3;
      const row = Math.floor(local / 3);
      cobble.width = Math.min(v.width / 7, v.contentHeight / 3.4);
      cobble.height = cobble.width;
      cobble.setPosition(v.width * (side / 2 + (column + 0.5) / 6), (v.contentHeight * (row + 0.5)) / 3);
      if (side === 0 && this.panel.values.normals) {
        this.lighting.normalsFrom(cobble, this.normals);
      }
    });
    this.lights.forEach((light, side) => {
      light.setPosition(v.width * (side / 2 + this.lightX / 2) * v.scale, this.lightY * v.contentHeight * v.scale);
      light.height = this.panel.values.height * v.scale;
      light.radius = Math.min(v.width * 0.24, v.contentHeight * 0.8) * v.scale;
    });
    this.lighting.debug = this.panel.values.debug ? 'normals' : null;
    this.panel.status(
      `${this.panel.values.normals ? 'Left: alpha-derived | Right: flat' : 'Both flat (unregistered)'} | same source, rotation, local light and height | no new normal-map art`,
    );
  }
  draw(context) {
    context.render(this.root);
  }
  destroy() {
    this.app.input.onPointerMove.remove(this.onMove);
    this.panel.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { LightmapNormalsScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(6, 7, 12),
});
await app.start(LightmapNormalsScene);
