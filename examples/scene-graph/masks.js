// Auto-generated from masks.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Graphics, Keyboard, Rectangle, Scene, Sprite, Text } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, startExample, toggle } from '@examples/runtime';
class MasksScene extends Scene {
  sprites = [];
  rectMask = new Rectangle();
  circle = this.track(new Graphics());
  outline = new Graphics();
  labels = [];
  panel;
  scale = 1;
  width = 1280;
  contentHeight = 600;
  drag = -1;
  offsets = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  init() {
    const texture = this.loader.get(assets.backgroundPlatformerHills);
    this.sprites = [0, 1].map(() => new Sprite(texture).setAnchor(0.5));
    this.labels = ['Rectangle mask', 'Graphics circle mask'].map(text =>
      new Text(text, { fillColor: Color.white, fontSize: 14, align: 'center' }).setAnchor(0.5),
    );
    this.root.addChild(...this.sprites, this.outline, ...this.labels);
    this.panel = demoPanel({
      scene: this,
      title: 'Masks',
      layout: 'bar',
      hint: 'Drag either mask. Both clip the same Kenney hills image in world coordinates.',
      controls: { bypass: toggle('Bypass') },
      actions: { Reset: () => this.reset() },
    });
    this.inputs.onTrigger(Keyboard.Space, () => this.panel.step('bypass'));
    this.inputs.onTrigger(Keyboard.R, () => this.reset());
    this.app.input.onPointerDown.add(this.onDown);
    this.app.input.onPointerMove.add(this.onMove);
    this.app.input.onPointerUp.add(this.onUp);
  }
  reset() {
    this.offsets = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    this.panel.set('bypass', false);
  }
  onDown = p => {
    this.drag = p.x < this.app.width / 2 ? 0 : 1;
    this.onMove(p);
  };
  onUp = () => {
    this.drag = -1;
  };
  onMove = p => {
    if (this.drag < 0) {
      return;
    }
    this.offsets[this.drag] = {
      x: p.x / this.scale - this.width * (this.drag === 0 ? 0.25 : 0.75),
      y: Math.min(this.contentHeight - 20, p.y / this.scale) - this.contentHeight / 2,
    };
  };
  update() {
    const view = this.panel.fit(this.app, this.app.canvas);
    this.scale = view.scale;
    this.width = view.width;
    this.contentHeight = view.contentHeight;
    this.root.setScale(view.scale);
    const radius = Math.min(70, view.contentHeight * 0.3);
    this.outline.clear();
    this.outline.lineColor = new Color(184, 242, 100);
    this.outline.lineWidth = 2;
    this.outline.fillColor = Color.transparent;
    for (const [index, sprite] of this.sprites.entries()) {
      const x = view.width * (index === 0 ? 0.25 : 0.75);
      const y = view.contentHeight / 2;
      sprite.setPosition(x, y);
      sprite.width = view.width * 0.43;
      sprite.height = Math.max(80, view.contentHeight - 45);
      this.labels[index].setPosition(x, 16);
      const mx = x + this.offsets[index].x;
      const my = y + this.offsets[index].y;
      if (index === 0) {
        this.rectMask.set((mx - radius) * view.scale, (my - radius) * view.scale, radius * 2 * view.scale, radius * 2 * view.scale);
        sprite.mask = this.panel.values.bypass ? null : this.rectMask;
        for (let offset = -radius; offset < radius; offset += 12) {
          const length = Math.min(6, radius - offset);
          this.outline.moveTo(mx + offset, my - radius);
          this.outline.lineTo(mx + offset + length, my - radius);
          this.outline.moveTo(mx + offset, my + radius);
          this.outline.lineTo(mx + offset + length, my + radius);
          this.outline.moveTo(mx - radius, my + offset);
          this.outline.lineTo(mx - radius, my + offset + length);
          this.outline.moveTo(mx + radius, my + offset);
          this.outline.lineTo(mx + radius, my + offset + length);
        }
      } else {
        this.circle.clear();
        this.circle.fillColor = Color.white;
        this.circle.drawCircle(0, 0, radius * view.scale);
        this.circle.setPosition(mx * view.scale, my * view.scale);
        sprite.mask = this.panel.values.bypass ? null : this.circle;
        for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
          this.outline.moveTo(mx + Math.cos(angle) * radius, my + Math.sin(angle) * radius);
          this.outline.lineTo(mx + Math.cos(angle + 0.1) * radius, my + Math.sin(angle + 0.1) * radius);
        }
      }
    }
    this.panel.status(this.panel.values.bypass ? 'Bypass: full hills image' : 'Clipped hills image | dashed contours are masks');
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
  scenes: { MasksScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(20, 27, 34),
});
await startExample(app, () => app.start(MasksScene));
