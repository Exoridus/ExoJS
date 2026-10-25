// Auto-generated from shadow-casters.ts - edit the .ts source, not this file.
import { Application, Color, Container, FixedResolutionCanvasSizing, Keyboard, ScaleModes, Scene, Sprite, Texture } from '@codexo/exojs';
import { AlphaOccluder, LightmapLighting, PointLight, SpotLight } from '@codexo/exojs/lighting';
import { choice, demoPanel, slider, startExample, toggle } from '@examples/runtime';
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
  context.fillStyle = '#b3aea5';
  context.fillRect(0, 0, 64, 64);
  context.fillStyle = '#a19c94';
  context.fillRect(0, 0, 32, 32);
  context.fillRect(32, 32, 32, 32);
});
const wallCanvas = canvasTexture(8, 8, context => {
  context.fillStyle = '#cfc9be';
  context.fillRect(0, 0, 8, 8);
});
// A cross, so the traced outline is visibly NOT the sprite's bounding box.
const pillarSize = 96;
const pillarCanvas = canvasTexture(pillarSize, pillarSize, context => {
  const arm = pillarSize / 3;
  context.fillStyle = '#d8cbb0';
  context.fillRect(arm, 0, arm, pillarSize);
  context.fillRect(0, arm, pillarSize, arm);
});
const controls = {
  radius: slider('Radius', { min: 80, max: 360, step: 10, value: 230 }),
  softness: slider('Softness', { min: 0, max: 1, step: 0.05, value: 0.35 }),
  occluders: toggle('Show occluders'),
  type: choice('Light', ['Point', 'Spot']),
};
class ShadowCastersScene extends Scene {
  world = new Container();
  lighting;
  torch;
  beam;
  turntable;
  panel;
  elapsed = 0;
  playing = true;
  dragging = false;
  lightX = 0.25;
  lightY = 0.55;
  scale = 1;
  width = 1280;
  height = 600;
  walls = [];
  init() {
    const floor = new Sprite(this.track(new Texture(floorCanvas, { scaleMode: ScaleModes.Linear })));
    this.world.addChild(floor);
    const wallTexture = this.track(new Texture(wallCanvas));
    const pillarTexture = this.track(new Texture(pillarCanvas));
    this.lighting = new LightmapLighting(this.app, { ambient: new Color(45, 47, 55), lightResolution: 1 });
    this.systems.add(this.lighting);
    for (let i = 0; i < 3; i++) {
      const piece = new Sprite(i === 1 ? pillarTexture : wallTexture).setAnchor(0.5);
      this.walls.push(piece);
      this.world.addChild(piece);
      this.lighting.occludeFrom(new AlphaOccluder(piece));
    }
    this.turntable = this.walls[2];
    this.root.addChild(this.world);
    this.torch = this.lighting.add(new PointLight({ radius: 500, intensity: 2.1, softness: 0.35, color: new Color(255, 210, 160) }));
    this.beam = this.lighting.add(
      new SpotLight({ radius: 500, angle: 40, coneSoftness: 0.35, intensity: 0, softness: 0.35, color: new Color(255, 210, 160) }),
    );
    this.panel = demoPanel({
      scene: this,
      title: 'Cast Shadows from Shapes',
      layout: 'bar',
      controls,
      hint: 'Drag the light. Point / Spot share position; the rotating wall owns its alpha outline.',
      actions: {
        'Pause / Resume': () => {
          this.playing = !this.playing;
        },
        Reset: () => this.reset(),
      },
    });
    this.inputs.onTrigger(Keyboard.Space, () => {
      this.playing = !this.playing;
    });
    this.inputs.onTrigger(Keyboard.R, () => this.reset());
    this.app.input.onPointerDown.add(this.onDown);
    this.app.input.onPointerMove.add(this.onMove);
    this.app.input.onPointerUp.add(this.onUp);
  }
  reset() {
    this.elapsed = 0;
    this.lightX = 0.25;
    this.lightY = 0.55;
    this.panel.set('radius', 230);
    this.panel.set('softness', 0.35);
    this.panel.set('type', 'Point');
    this.panel.set('occluders', false);
  }
  onDown = p => {
    this.dragging = true;
    this.onMove(p);
  };
  onMove = p => {
    if (this.dragging) {
      this.lightX = Math.max(0, Math.min(1, p.x / this.scale / this.width));
      this.lightY = Math.max(0, Math.min(1, p.y / this.scale / this.height));
    }
  };
  onUp = () => {
    this.dragging = false;
  };
  update(delta) {
    const v = this.panel.fit(this.app, this.app.canvas);
    this.scale = v.scale;
    this.width = v.width;
    this.height = v.contentHeight;
    this.root.setScale(v.scale);
    const floor = this.world.children[0];
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
      `${this.panel.values.type} light | ${this.playing ? 'wall rotating' : 'paused'} | rectangle and alpha-cross cast real shadows`,
    );
  }
  draw(context) {
    context.render(this.root);
  }
  destroy() {
    this.app.input.onPointerDown.remove(this.onDown);
    this.app.input.onPointerMove.remove(this.onMove);
    this.app.input.onPointerUp.remove(this.onUp);
    this.panel.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { ShadowCastersScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(6, 7, 12),
});
await startExample(app, () => app.start(ShadowCastersScene));
