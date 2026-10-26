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
import { demoPanel, startExample } from '@examples/runtime';
class CameraNavigationScene extends Scene {
  view;
  grid = new Graphics();
  landmarks = new Graphics();
  labels = [];
  actions = new ActionMap({
    pan: new VectorAction([
      {
        up: [Keyboard.W, Keyboard.Up],
        down: [Keyboard.S, Keyboard.Down],
        left: [Keyboard.A, Keyboard.Left],
        right: [Keyboard.D, Keyboard.Right],
      },
      { x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY },
    ]),
  });
  pointer = { x: 640, y: 360 };
  world = { x: 640, y: 360 };
  gridWidth = 0;
  panel;
  onPointerMove = (_pointer, x, y) => {
    this.pointer.x = x;
    this.pointer.y = y;
  };
  onMouseWheel = (_deltaX, deltaY) => {
    this.zoom(Math.exp(-deltaY * 0.001));
  };
  init() {
    const { width, height } = this.app;
    this.view = new View(width / 2, height / 2, width, height);
    const points = [
      { x: 320, y: 240, name: 'A (320, 240)', color: new Color(111, 163, 232) },
      { x: 960, y: 240, name: 'B (960, 240)', color: new Color(151, 226, 60) },
      { x: 640, y: 400, name: 'C (640, 400)', color: new Color(190, 147, 224) },
    ];
    for (const point of points) {
      this.landmarks.fillColor = point.color;
      this.landmarks.drawRoundedRectangle(point.x - 32, point.y - 32, 64, 64, 8);
      this.labels.push(new Text(point.name, { fillColor: Color.white, fontSize: 22 }).setAnchor(0.5, 0).setPosition(point.x, point.y + 42));
    }
    this.inputs.attach(this.actions);
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls: {},
    });
    this.inputs.onTrigger(Keyboard.Equal, () => this.zoom(1.2));
    this.inputs.onTrigger(Keyboard.Minus, () => this.zoom(1 / 1.2));
    this.app.input.onPointerMove.add(this.onPointerMove);
    this.app.input.onMouseWheel.add(this.onMouseWheel);
  }
  zoom(factor) {
    this.view.setZoom(Math.max(0.3, Math.min(3, this.view.zoomLevel * factor)));
  }
  update(delta) {
    const fit = this.panel.fit(this.app, this.app.canvas);
    const lineWidth = fit.scale / this.view.zoomLevel;
    if (lineWidth !== this.gridWidth) {
      this.gridWidth = lineWidth;
      this.grid.clear();
      // Strokes stay one CSS pixel wide even when the world and iframe are scaled.
      this.grid.lineWidth = lineWidth;
      this.grid.lineColor = new Color(182, 199, 219, 0.3);
      for (let x = -3200; x <= 4480; x += 80) {
        this.grid.drawLine(x, -2400, x, 3120);
      }
      for (let y = -2400; y <= 3120; y += 80) {
        this.grid.drawLine(-3200, y, 4480, y);
      }
    }
    for (const label of this.labels) {
      label.setScale(fit.scale / this.view.zoomLevel);
    }
    const { x, y } = this.actions.pan.value;
    this.view.move(x * 420 * delta, y * 420 * delta);
    this.world = this.view.screenToWorld(this.pointer.x, this.pointer.y);
    this.panel.status(
      `Screen ${this.pointer.x.toFixed(0)}, ${this.pointer.y.toFixed(0)} | World ${this.world.x.toFixed(0)}, ${this.world.y.toFixed(0)} | Zoom ${this.view.zoomLevel.toFixed(2)}`,
    );
  }
  draw(context) {
    context.render(this.grid, { view: this.view });
    context.render(this.landmarks, { view: this.view });
    for (const label of this.labels) {
      context.render(label, { view: this.view });
    }
  }
  destroy() {
    this.app.input.onPointerMove.remove(this.onPointerMove);
    this.app.input.onMouseWheel.remove(this.onMouseWheel);
    this.panel.dispose();
    this.view.destroy();
    this.grid.destroy();
    this.landmarks.destroy();
    for (const label of this.labels) {
      label.destroy();
    }
    super.destroy();
  }
}
const app = new Application({
  scenes: { CameraNavigationScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(16, 23, 30),
});
await startExample(app, () => app.start(CameraNavigationScene));
