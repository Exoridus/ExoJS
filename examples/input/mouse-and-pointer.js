// Auto-generated from mouse-and-pointer.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Graphics, Scene, Sprite } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { mountControls } from '@examples/runtime';
// Everything the pointer pipeline reports, surfaced at once:
//   - live position (onPointerMove)
//   - pressed-button bitmask (Pointer.buttons: 1=left, 2=right, 4=middle)
//   - frame-to-frame movement delta
//   - a click counter (onPointerTap fires on a press+release without a drag)
//   - a draggable sprite (the engine's built-in drag on an interactive node)
class MouseAndPointerScene extends Scene {
  onPointerMove = pointer => {
    this.pointer.x = pointer.x;
    this.pointer.y = pointer.y;
    this.buttons = pointer.buttons;
  };
  onPointerDown = pointer => {
    this.buttons = pointer.buttons;
  };
  onPointerUp = pointer => {
    this.buttons = pointer.buttons;
  };
  onPointerTap = () => {
    this.clicks++;
  };
  ship;
  crosshair;
  pointer = { x: 400, y: 300 };
  previous = { x: 400, y: 300 };
  deltaX = 0;
  deltaY = 0;
  buttons = 0;
  clicks = 0;
  hud;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.pointer = { x: width / 2, y: height / 2 };
    this.previous = { x: width / 2, y: height / 2 };
    this.ship = new Sprite(this.loader.get(assets.ship)).setAnchor(0.5).setPosition(width / 2, height / 2);
    this.ship.interactive = true;
    this.ship.draggable = true;
    this.root.addChild(this.ship);
    this.crosshair = new Graphics();
    this.app.input.onPointerMove.add(this.onPointerMove);
    this.app.input.onPointerDown.add(this.onPointerDown);
    this.app.input.onPointerUp.add(this.onPointerUp);
    this.app.input.onPointerTap.add(this.onPointerTap);
    this.hud = mountControls();
  }
  buttonLabel() {
    const held = [this.buttons & 1 && 'Left', this.buttons & 2 && 'Right', this.buttons & 4 && 'Middle'].filter(Boolean);
    return held.length ? held.join(' + ') : 'none';
  }
  update() {
    this.deltaX = this.pointer.x - this.previous.x;
    this.deltaY = this.pointer.y - this.previous.y;
    this.previous.x = this.pointer.x;
    this.previous.y = this.pointer.y;
    this.hud.setStatus(
      `x ${Math.round(this.pointer.x)}, y ${Math.round(this.pointer.y)} · Δ ${this.deltaX >= 0 ? '+' : ''}${this.deltaX.toFixed(0)}, ${this.deltaY >= 0 ? '+' : ''}${this.deltaY.toFixed(0)} · buttons: ${this.buttonLabel()} · clicks: ${this.clicks}`,
    );
  }
  draw(context) {
    context.render(this.root);
    this.crosshair.clear();
    this.crosshair.lineWidth = 2;
    this.crosshair.lineColor = new Color(255, 220, 80);
    this.crosshair.drawLine(this.pointer.x - 12, this.pointer.y, this.pointer.x + 12, this.pointer.y);
    this.crosshair.drawLine(this.pointer.x, this.pointer.y - 12, this.pointer.x, this.pointer.y + 12);
    context.render(this.crosshair);
  }
  destroy() {
    this.app.input.onPointerMove.remove(this.onPointerMove);
    this.app.input.onPointerDown.remove(this.onPointerDown);
    this.app.input.onPointerUp.remove(this.onPointerUp);
    this.app.input.onPointerTap.remove(this.onPointerTap);
    this.crosshair?.destroy();
    this.hud?.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { MouseAndPointerScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(10, 12, 20),
});
await app.start(MouseAndPointerScene);
