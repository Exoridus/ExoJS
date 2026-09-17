// Auto-generated from normal-mapped-blocks.ts - edit the .ts source, not this file.
import { Application, Color, Container, FixedResolutionCanvasSizing, Scene, Sprite } from '@codexo/exojs';
import { Lighting, normalMap, PointLight, SunLight } from '@codexo/exojs-lighting';
import { mountControlPanel, mountControls } from '@examples/runtime';
// The scene the `pixi-lights` demo is built from, in ExoJS vocabulary. It is
// worth porting because it is the one axis where a deferred plugin is
// architecturally ahead of forward shading: many lights AND authored normal
// maps at once.
//
// There, a sprite is split in two - one in a diffuse layer, one in a normal
// layer - and a deferred pass combines them. Here a drawable is drawn once and
// says where its normals come from, and a prepass draws those normals at the
// drawable's own place. No layers, no parent groups, no second sprite.
const BLOCK_WIDTH = 120;
const BLOCK_HEIGHT = 60;
class NormalMappedBlocksScene extends Scene {
  world;
  lighting;
  pointer;
  added = 0;
  hud;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.world = new Container();
    // `auto` with an application resolves to the lightmap renderer: no light
    // cap, and a normal prepass for whatever registers one.
    this.lighting = new Lighting({ app, ambient: new Color(31, 31, 36), lightResolution: 1 });
    this.systems.add(this.lighting);
    const stoneDiffuse = this.loader.get(assets.demo.textures.litStoneDiffuse);
    const stoneNormal = this.loader.get(assets.demo.textures.litStoneNormal);
    const blockDiffuse = this.loader.get(assets.demo.textures.litBlockDiffuse);
    const blockNormal = this.loader.get(assets.demo.textures.litBlockNormal);
    const ground = new Sprite(stoneDiffuse);
    ground.width = width;
    ground.height = height;
    this.world.addChild(ground);
    this.lighting.normalsFrom(ground, normalMap(stoneNormal));
    // One source per atlas, not per sprite: the three blocks share a normal map,
    // so they share the prepass batch that draws it.
    const blockNormals = normalMap(blockNormal);
    for (const [x, y] of [
      [100, 100],
      [500, 100],
      [300, 400],
    ]) {
      const block = new Sprite(blockDiffuse);
      block.width = BLOCK_WIDTH;
      block.height = BLOCK_HEIGHT;
      block.setPosition(x, y);
      this.world.addChild(block);
      this.lighting.normalsFrom(block, blockNormals);
    }
    // The demo's directional light, which here is a shape rather than a light
    // pointed at one object: no position, no falloff, parallel everywhere.
    this.lighting.add(new SunLight({ intensity: 0.45, color: new Color(77, 77, 89) })).setRotation(35);
    this.pointer = this.lighting.add(new PointLight({ radius: 420, intensity: 2.2, height: 40 }));
    this.pointer.setPosition(525, 160);
    app.input.onPointerMove.add(pointer => {
      this.pointer.setPosition(pointer.x, pointer.y);
    });
    // Click to leave a light behind, exactly as the original does.
    app.input.onPointerTap.add(pointer => {
      this.lighting.add(new PointLight({ radius: 320, intensity: 1.8, height: 40 })).setPosition(pointer.x, pointer.y);
      this.added++;
    });
    this.hud = mountControls({
      title: 'Normal-Mapped Blocks',
      hint: 'Move the pointer to carry the light; click to leave one behind. Each drawable is drawn once and says where its normals come from - there is no second sprite in a normal layer.',
      status: '',
    });
    const panel = mountControlPanel({ title: 'Surfaces', corner: 'top-right' });
    panel.addToggle({
      label: 'Show normals',
      value: false,
      onChange: value => {
        this.lighting.debug = value ? 'normals' : null;
      },
    });
    panel.addSlider({
      label: 'Light height',
      min: 4,
      max: 200,
      step: 2,
      value: this.pointer.height,
      onChange: value => {
        this.pointer.height = value;
      },
    });
  }
  draw(context) {
    context.render(this.world);
    this.hud.setStatus(`${this.lighting.activeLightCount} lights (${this.added} placed) - ${this.lighting.activeSurfaceCount} lit surfaces`);
  }
}
const app = new Application({
  scenes: { NormalMappedBlocksScene },
  canvas: {
    width: 1024,
    height: 512,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});
await app.start(NormalMappedBlocksScene);
