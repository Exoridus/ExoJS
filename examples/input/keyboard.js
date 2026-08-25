// Auto-generated from keyboard.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Graphics, Keyboard, Scene } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
// Two ways to read the keyboard, shown side by side:
//
//   - on-event: `inputs.onStart` / `onStop` fire once on the press / release
//     transition. Great for discrete actions (here: a recentre tap on Escape).
//   - per-frame polling: `inputs.onActive` called without a callback just
//     returns the binding, which samples the channel buffer every frame - so
//     reading `binding.active` inside update() gives the live held-state.
//
// Both WASD and the arrow keys drive the same square via a single binding per
// direction (each binding watches two channels at once).
class KeyboardScene extends Scene {
  square;
  position = { x: 400, y: 300 };
  up;
  down;
  left;
  right;
  hud;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.square = new Graphics();
    this.position = { x: width / 2, y: height / 2 };
    // Per-frame polling source: one binding per direction, each listening to
    // both the WASD key and the matching arrow key. We keep the references
    // and read their live state in update() rather than mutating flags.
    this.up = this.inputs.onActive([Keyboard.W, Keyboard.Up]);
    this.down = this.inputs.onActive([Keyboard.S, Keyboard.Down]);
    this.left = this.inputs.onActive([Keyboard.A, Keyboard.Left]);
    this.right = this.inputs.onActive([Keyboard.D, Keyboard.Right]);
    // On-event source: a discrete tap that snaps the square back to centre.
    this.inputs.onStart(Keyboard.Escape, () => {
      this.position.x = width / 2;
      this.position.y = height / 2;
    });
    this.hud = mountControls({
      title: 'Keyboard',
      controls: [
        { keys: ['W', 'A', 'S', 'D'], action: 'move (per-frame polling)' },
        { keys: ['↑', '↓', '←', '→'], action: 'move (same bindings)' },
        { keys: 'Esc', action: 'recentre (on-event)' },
      ],
      status: 'Held: none',
      hint: 'Click the canvas first so it has keyboard focus.',
    });
  }
  update(delta) {
    const app = this.app;
    const { width, height } = app;
    const speed = 280 * delta;
    const moveX = (this.right.active ? 1 : 0) - (this.left.active ? 1 : 0);
    const moveY = (this.down.active ? 1 : 0) - (this.up.active ? 1 : 0);
    this.position.x = Math.max(20, Math.min(width - 20, this.position.x + moveX * speed));
    this.position.y = Math.max(20, Math.min(height - 20, this.position.y + moveY * speed));
    const held = [this.up.active && 'Up', this.down.active && 'Down', this.left.active && 'Left', this.right.active && 'Right'].filter(Boolean);
    this.hud.setStatus(`Held: ${held.length ? held.join(' + ') : 'none'}`);
  }
  draw(context) {
    this.square.clear();
    this.square.fillColor = new Color(120, 200, 255);
    this.square.drawRectangle(this.position.x - 20, this.position.y - 20, 40, 40);
    context.render(this.square);
  }
}
const app = new Application({
  scenes: { KeyboardScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(10, 12, 20),
  loader: {
    basePath: 'assets/',
  },
});
app.start(KeyboardScene);
