// Auto-generated from world-vs-screen-coords.ts - edit the .ts source, not this file.
import {
  ActionMap,
  Application,
  Color,
  FixedResolutionCanvasSizing,
  GamepadAxis,
  Graphics,
  Keyboard,
  Scene,
  Text,
  VectorAction,
  View,
} from '@codexo/exojs';
import { startExample, unitsPerCssPixel } from '@examples/runtime';
class CameraNavigationScene extends Scene {
  view;
  ground = new Graphics();
  target = new Graphics().setPosition(640, 360);
  hint = new Text('WASD: move | F: free + drag | Wheel: zoom', {
    fillColor: Color.white,
    fontSize: 15,
  }).setAnchor(0.5, 1);
  readout = new Text('', { fillColor: new Color(154, 196, 188), fontSize: 13, fontFamily: 'monospace' });
  actions = new ActionMap({
    move: new VectorAction([
      {
        up: [Keyboard.W, Keyboard.Up],
        down: [Keyboard.S, Keyboard.Down],
        left: [Keyboard.A, Keyboard.Left],
        right: [Keyboard.D, Keyboard.Right],
      },
      { x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY },
    ]),
  });
  following = true;
  wheelDelta = 0;
  interacted = false;
  pointer = { x: 640, y: 360 };
  dragPointer = null;
  init() {
    this.view = new View(640, 360, this.app.width, this.app.height).follow(this.target);
    this.ground.fillColor = new Color(28, 38, 53);
    this.ground.drawRectangle(-1600, -1200, 4480, 3120);
    this.ground.fillColor = new Color(47, 61, 80);
    this.ground.drawRectangle(-1600, 290, 4480, 140).drawRectangle(570, -1200, 140, 3120);
    this.ground.fillColor = new Color(85, 150, 155);
    for (let x = -1200; x < 2800; x += 400) {
      this.ground.drawRectangle(x, 284, 120, 12).drawRectangle(x, 424, 120, 12);
    }
    this.target.fillColor = new Color(240, 217, 138);
    this.target.drawPolygon([0, -28, 22, 22, 0, 12, -22, 22]);
    this.inputs.attach(this.actions);
    this.inputs.onTrigger(Keyboard.F, () => {
      this.following = !this.following;
      this.endDrag();
      if (this.following) {
        this.view.follow(this.target);
      } else {
        this.view.clearFollow();
      }
      this.interacted = true;
    });
    this.inputs.onTrigger(Keyboard.Equal, () => this.zoom(1.2));
    this.inputs.onTrigger(Keyboard.Minus, () => this.zoom(1 / 1.2));
    this.app.input.onPointerDown.add(this.onDown);
    this.app.input.onPointerMove.add(this.onMove);
    this.app.input.onPointerUp.add(this.onEnd);
    this.app.input.onPointerCancel.add(this.onEnd);
    this.app.input.onMouseWheel.add(this.onWheel);
    // Native release/blur must end navigation even outside the input surface.
    window.addEventListener('pointerup', this.onWindowEnd);
    window.addEventListener('blur', this.endDrag);
  }
  onDown = (pointer, x, y) => {
    if (this.following || this.dragPointer !== null) {
      return;
    }
    this.dragPointer = pointer.id;
    this.pointer = { x, y };
  };
  onMove = (pointer, x, y) => {
    if (this.dragPointer !== null && pointer.id !== this.dragPointer) {
      return;
    }
    if (this.dragPointer !== null) {
      this.view.move((this.pointer.x - x) / this.view.zoomLevel, (this.pointer.y - y) / this.view.zoomLevel);
      this.interacted = true;
    }
    this.pointer = { x, y };
  };
  onEnd = pointer => {
    if (pointer.id === this.dragPointer) {
      this.endDrag();
    }
  };
  onWindowEnd = event => {
    if (event.pointerId === this.dragPointer) {
      this.endDrag();
    }
  };
  endDrag = () => {
    this.dragPointer = null;
  };
  onWheel = (_x, y) => {
    this.wheelDelta += y;
  };
  zoom(factor) {
    const before = this.view.screenToWorld(this.pointer.x, this.pointer.y);
    this.view.setZoom(Math.max(0.4, Math.min(3, this.view.zoomLevel * factor)));
    const after = this.view.screenToWorld(this.pointer.x, this.pointer.y);
    this.view.move(before.x - after.x, before.y - after.y);
    if (this.following) {
      this.view.follow(this.target, { offsetX: this.view.center.x - this.target.x, offsetY: this.view.center.y - this.target.y });
    }
    this.interacted = true;
  }
  update(delta) {
    // Wheel signals precede pointer phases; zoom only after the latest position arrives.
    if (this.wheelDelta !== 0) {
      this.zoom(Math.exp(-this.wheelDelta * 0.001));
      this.wheelDelta = 0;
    }
    const { x, y } = this.actions.move.value;
    this.target.x += x * 320 * delta;
    this.target.y += y * 320 * delta;
    if (x || y) {
      this.interacted = true;
    }
    const scale = unitsPerCssPixel(this.app, this.app.canvas);
    const world = this.view.screenToWorld(this.pointer.x, this.pointer.y);
    const screen = this.view.worldToScreen(world.x, world.y);
    this.readout.text = `Screen ${screen.x.toFixed(0)}, ${screen.y.toFixed(0)}\nWorld ${world.x.toFixed(0)}, ${world.y.toFixed(0)}`;
    this.readout
      .setScale(scale)
      .setPosition(
        Math.min(this.app.width - 190 * scale, screen.x + 16 * scale),
        Math.max(0, Math.min(this.app.height - 50 * scale, screen.y + 20 * scale)),
      );
    this.hint.setScale(Math.min(scale, this.app.width / 360)).setPosition(this.app.width / 2, this.app.height - 20 * scale);
  }
  draw(context) {
    context.render(this.ground, { view: this.view });
    context.render(this.target, { view: this.view });
    context.render(this.readout, { view: context.screenView });
    if (!this.interacted) {
      context.render(this.hint, { view: context.screenView });
    }
  }
  destroy() {
    this.endDrag();
    this.app.input.onPointerDown.remove(this.onDown);
    this.app.input.onPointerMove.remove(this.onMove);
    this.app.input.onPointerUp.remove(this.onEnd);
    this.app.input.onPointerCancel.remove(this.onEnd);
    this.app.input.onMouseWheel.remove(this.onWheel);
    window.removeEventListener('pointerup', this.onWindowEnd);
    window.removeEventListener('blur', this.endDrag);
    this.view?.destroy();
    this.ground.destroy();
    this.target.destroy();
    this.hint.destroy();
    this.readout.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { CameraNavigationScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(14, 21, 32),
});
await startExample(app, () => app.start(CameraNavigationScene));
