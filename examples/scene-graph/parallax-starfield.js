// Auto-generated from parallax-starfield.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Graphics, Scene } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
const speeds = [0.15, 0.35, 0.6];
const counts = [120, 80, 48];
const colors = [new Color(120, 140, 200), new Color(170, 190, 255), new Color(255, 255, 255)];
class ParallaxStarfieldScene extends Scene {
  layers;
  pointer = { x: 0, y: 0 };
  hud;
  onPointerMove = pointer => {
    this.pointer.x = pointer.x;
    this.pointer.y = pointer.y;
  };
  init() {
    const app = this.app;
    const { width, height } = app;
    const margin = 80;
    this.pointer = { x: width / 2, y: height / 2 };
    this.layers = counts.map((count, index) => {
      const g = new Graphics();
      g.fillColor = colors[index];
      for (let i = 0; i < count; i++) {
        const x = Math.random() * (width + margin * 2) - margin;
        const y = Math.random() * (height + margin * 2) - margin;
        const r = 1 + index;
        g.drawCircle(x, y, r);
      }
      return g;
    });
    this.hud = mountControls({
      title: 'Parallax Layers',
      controls: [{ keys: 'Move pointer', action: 'shift the three depth layers' }],
      hint: 'Near stars travel farther than distant stars for the same pointer movement.',
    });
    app.input.onPointerMove.add(this.onPointerMove);
  }
  draw(context) {
    const app = this.app;
    const { width, height } = app;
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      const factor = speeds[i];
      layer.setPosition((width / 2 - this.pointer.x) * factor, (height / 2 - this.pointer.y) * factor);
      context.render(layer);
    }
  }
  destroy() {
    this.app.input.onPointerMove.remove(this.onPointerMove);
    this.hud.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { ParallaxStarfieldScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  loader: {
    basePath: 'assets/',
  },
});
await app.start(ParallaxStarfieldScene);
