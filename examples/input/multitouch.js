// Auto-generated from multitouch.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Graphics, Scene, Text } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
const MAX_TOUCHES = 10;
// Ten distinct hues so up to ten simultaneous fingers each get their own colour.
const colors = [
  new Color(255, 100, 100),
  new Color(255, 170, 90),
  new Color(255, 230, 120),
  new Color(170, 255, 120),
  new Color(100, 255, 160),
  new Color(100, 230, 255),
  new Color(120, 170, 255),
  new Color(170, 130, 255),
  new Color(230, 120, 255),
  new Color(255, 130, 200),
];
class MultitouchScene extends Scene {
  onPointerDown = pointer => {
    if (this.pointers.size >= MAX_TOUCHES || this.pointers.has(pointer.id)) {
      return;
    }
    this.pointers.set(pointer.id, { id: pointer.id, x: pointer.x, y: pointer.y });
    this.refreshHud();
  };
  onPointerMove = pointer => {
    const touch = this.pointers.get(pointer.id);
    if (touch) {
      touch.x = pointer.x;
      touch.y = pointer.y;
    }
  };
  onPointerUp = pointer => {
    this.pointers.delete(pointer.id);
    this.refreshHud();
  };
  onPointerCancel = pointer => {
    this.pointers.delete(pointer.id);
    this.refreshHud();
  };
  graphics;
  labels = [];
  pointers = new Map();
  hud;
  init() {
    this.graphics = new Graphics();
    // Reusable label pool - one Text per possible touch, repositioned each frame.
    for (let i = 0; i < MAX_TOUCHES; i++) {
      this.labels.push(new Text('', { fillColor: Color.white, fontSize: 16 }).setAnchor(0.5));
    }
    this.app.input.onPointerDown.add(this.onPointerDown);
    this.app.input.onPointerMove.add(this.onPointerMove);
    this.app.input.onPointerUp.add(this.onPointerUp);
    this.app.input.onPointerCancel.add(this.onPointerCancel);
    this.hud = mountControls({ status: 'Active touches: 0 / 10' });
  }
  refreshHud() {
    this.hud.setStatus(`Active touches: ${this.pointers.size} / ${MAX_TOUCHES}`);
  }
  draw(context) {
    this.graphics.clear();
    let index = 0;
    for (const touch of this.pointers.values()) {
      const color = colors[index % colors.length];
      this.graphics.fillColor = color;
      this.graphics.drawCircle(touch.x, touch.y, 28);
      const label = this.labels[index];
      label.text = `${index + 1}·#${touch.id}`;
      label.setPosition(touch.x, touch.y);
      index++;
    }
    context.render(this.graphics);
    // Draw the index/id labels on top of their circles.
    for (let i = 0; i < this.pointers.size; i++) {
      context.render(this.labels[i]);
    }
  }
  destroy() {
    this.app.input.onPointerDown.remove(this.onPointerDown);
    this.app.input.onPointerMove.remove(this.onPointerMove);
    this.app.input.onPointerUp.remove(this.onPointerUp);
    this.app.input.onPointerCancel.remove(this.onPointerCancel);
    for (const label of this.labels) {
      label.destroy();
    }
    this.graphics?.destroy();
    this.hud?.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { MultitouchScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(10, 12, 20),
});
await app.start(MultitouchScene);
