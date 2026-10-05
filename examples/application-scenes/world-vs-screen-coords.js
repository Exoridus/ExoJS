// Auto-generated from world-vs-screen-coords.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Graphics, Keyboard, Scene, Text, View } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
class CameraNavigationScene extends Scene {
  view;
  grid;
  markers;
  readout;
  hud;
  up;
  down;
  left;
  right;
  pointer = { x: 640, y: 360 };
  world = { x: 640, y: 360 };
  onPointerMove = pointer => {
    this.pointer.x = pointer.x;
    this.pointer.y = pointer.y;
  };
  onPointerTap = pointer => {
    const point = this.view.screenToWorld(pointer.x, pointer.y);
    this.markers.fillColor = new Color(255, 190, 75);
    this.markers.drawCircle(point.x, point.y, 8);
  };
  onMouseWheel = (_deltaX, deltaY) => {
    this.view.setZoom(Math.max(0.3, Math.min(3, this.view.zoomLevel * Math.exp(-deltaY * 0.001))));
  };
  init() {
    const { width, height } = this.app;
    this.view = new View(width / 2, height / 2, width, height);
    this.pointer = { x: width / 2, y: height / 2 };
    this.grid = new Graphics();
    this.grid.lineWidth = 1;
    this.grid.lineColor = new Color(65, 74, 92);
    for (let x = -800; x <= width + 800; x += 80) {
      this.grid.drawLine(x, -600, x, height + 600);
    }
    for (let y = -600; y <= height + 600; y += 80) {
      this.grid.drawLine(-800, y, width + 800, y);
    }
    this.markers = new Graphics();
    this.readout = new Text('', { fillColor: Color.white, fontSize: 17 });
    this.readout.setPosition(18, height - 88);
    this.up = this.inputs.onActive([Keyboard.W, Keyboard.Up]);
    this.down = this.inputs.onActive([Keyboard.S, Keyboard.Down]);
    this.left = this.inputs.onActive([Keyboard.A, Keyboard.Left]);
    this.right = this.inputs.onActive([Keyboard.D, Keyboard.Right]);
    this.app.input.onPointerMove.add(this.onPointerMove);
    this.app.input.onPointerTap.add(this.onPointerTap);
    this.app.input.onMouseWheel.add(this.onMouseWheel);
    this.hud = mountControls({
      title: 'Camera Navigation',
      controls: [
        { keys: 'WASD / arrows', action: 'pan' },
        { keys: 'Wheel', action: 'zoom' },
        { keys: 'Move / click', action: 'inspect / mark world point' },
      ],
      hint: 'Markers use world coordinates; the readout stays fixed on screen.',
    });
  }
  update(delta) {
    const x = (this.right.active ? 1 : 0) - (this.left.active ? 1 : 0);
    const y = (this.down.active ? 1 : 0) - (this.up.active ? 1 : 0);
    this.view.move(x * 420 * delta, y * 420 * delta);
    this.world = this.view.screenToWorld(this.pointer.x, this.pointer.y);
    this.readout.text = `Screen ${this.pointer.x.toFixed(0)}, ${this.pointer.y.toFixed(0)}\nWorld ${this.world.x.toFixed(0)}, ${this.world.y.toFixed(0)}\nZoom ${this.view.zoomLevel.toFixed(2)}`;
  }
  draw(context) {
    context.render(this.grid, { view: this.view });
    context.render(this.markers, { view: this.view });
    context.render(this.readout, { view: context.screenView });
  }
  destroy() {
    this.app.input.onPointerMove.remove(this.onPointerMove);
    this.app.input.onPointerTap.remove(this.onPointerTap);
    this.app.input.onMouseWheel.remove(this.onMouseWheel);
    this.hud.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { CameraNavigationScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(10, 12, 20),
  loader: { basePath: 'assets/' },
});
await app.start(CameraNavigationScene);
