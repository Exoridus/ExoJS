// Auto-generated from lightmap-normals.ts - edit the .ts source, not this file.
import { Application, Color, Container, FixedResolutionCanvasSizing, ScaleModes, Scene, Sprite, Texture } from '@codexo/exojs';
import { AlphaNormals, Lighting, PointLight } from '@codexo/exojs-lighting';
import { mountControlPanel, mountControls } from '@examples/runtime';
// The lightmap renderer multiplies a frame that was already drawn, so by the
// time the light field is composited there is no surface normal anywhere. A
// normal prepass puts one back: register a drawable and the renderer draws its
// normal map, at the drawable's own place and rotation, into an attachment the
// light shader then reads at its own screen position.
//
// Nothing is required of a drawable that is not registered - the attachment's
// alpha is coverage, and where it is zero the light lands with no `N dot L`
// term at all. That is what the "Normals" toggle below shows: switching them
// off cannot darken anything, it only flattens what asked for them.
//
// Nobody authored a normal map here either. `AlphaNormals` reads the
// silhouette as a height field, once at load.
const canvasTexture = (width, height, paint) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('2D canvas context unavailable.');
  paint(context);
  return new Texture(canvas, { scaleMode: ScaleModes.Linear, generateMipMap: false });
};
const floorTexture = canvasTexture(64, 64, context => {
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
const cobbleTexture = canvasTexture(cobbleSize, cobbleSize, context => {
  const gradient = context.createRadialGradient(cobbleSize / 2, cobbleSize / 2, cobbleSize * 0.12, cobbleSize / 2, cobbleSize / 2, cobbleSize * 0.48);
  gradient.addColorStop(0, 'rgba(198, 190, 176, 1)');
  gradient.addColorStop(0.72, 'rgba(176, 168, 154, 1)');
  gradient.addColorStop(1, 'rgba(150, 142, 128, 0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(cobbleSize / 2, cobbleSize / 2, cobbleSize * 0.48, 0, Math.PI * 2);
  context.fill();
});
class LightmapNormalsScene extends Scene {
  world;
  lighting;
  cobbles = [];
  normals;
  torch;
  lantern;
  elapsed = 0;
  hud;
  init() {
    const { width, height } = this.app;
    this.world = new Container();
    // `auto` with an application resolves to the lightmap renderer, which is
    // the one with a light field for a prepass to feed.
    this.lighting = new Lighting({ app: this.app, ambient: new Color(20, 21, 30), lightResolution: 1 });
    this.systems.add(this.lighting);
    const floor = new Sprite(floorTexture);
    floor.width = width;
    floor.height = height;
    this.world.addChild(floor);
    // Derived once, shared by every cobble: the source holds the baked texture,
    // and deriving it per sprite would run the same Sobel pass sixty times.
    this.normals = new AlphaNormals(cobbleTexture);
    for (let row = 0; row < 5; row++) {
      for (let column = 0; column < 9; column++) {
        const cobble = new Sprite(cobbleTexture).setAnchor(0.5);
        const stagger = row % 2 === 0 ? 0 : 66;
        cobble.width = 118;
        cobble.height = 118;
        cobble.setPosition(90 + column * 132 + stagger, 140 + row * 118);
        // Turned, so the prepass has to rotate each normal into world space -
        // a stone lit from the left must stay lit from the left however it sits.
        cobble.rotation = (row * 9 + column * 23) % 360;
        this.world.addChild(cobble);
        this.cobbles.push(this.lighting.normalsFrom(cobble, this.normals));
      }
    }
    this.torch = this.lighting.add(new PointLight({ radius: 480, intensity: 2.4, height: 34, color: new Color(255, 190, 130) }));
    this.lantern = this.lighting.add(new PointLight({ radius: 360, intensity: 1.8, height: 90, color: new Color(150, 200, 255) }));
    this.hud = mountControls({
      title: 'Normals under the lightmap renderer',
      hint: 'Nobody authored a normal map: the cobbles are round because their own alpha says so. Switch the normals off and the light stays exactly as bright - it just stops finding a surface to land on.',
      status: '',
    });
    const panel = mountControlPanel({ title: 'Surfaces', corner: 'top-right' });
    panel.addToggle({
      label: 'Normals',
      value: true,
      onChange: value => {
        for (const cobble of this.cobbles) {
          if (value) {
            this.lighting.normalsFrom(cobble, this.normals);
          } else {
            this.lighting.stopNormals(cobble);
          }
        }
      },
    });
    panel.addToggle({
      label: 'Show normals',
      value: false,
      onChange: value => {
        this.lighting.debug = value ? 'normals' : null;
      },
    });
    panel.addSlider({
      label: 'Light height',
      min: 8,
      max: 160,
      step: 2,
      value: this.torch.height,
      onChange: value => {
        this.torch.height = value;
      },
    });
  }
  update(delta) {
    this.elapsed += delta;
    this.torch.setPosition(640 + Math.cos(this.elapsed * 0.5) * 420, 380 + Math.sin(this.elapsed * 0.77) * 220);
    this.lantern.setPosition(640 + Math.cos(this.elapsed * 0.31 + 2.2) * 300, 380 + Math.sin(this.elapsed * 0.44 + 1.1) * 260);
  }
  draw(context) {
    context.render(this.world);
    this.hud.setStatus(`${this.lighting.activeSurfaceCount} lit surfaces - ${this.lighting.quality} renderer - draw calls ${context.stats.drawCalls}`);
  }
}
const app = new Application({
  scenes: { LightmapNormalsScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(5, 6, 11),
});
await app.start(LightmapNormalsScene);
