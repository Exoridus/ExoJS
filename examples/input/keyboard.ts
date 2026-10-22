import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  type InputBinding,
  Keyboard,
  type RenderingContext,
  Scene,
  type Seconds,
} from '@codexo/exojs';
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
//
// The Output panel under the preview shows the transitions: every key press
// from `app.input.onKeyDown`, the recentre action, and changes in the held
// set - logged when they happen, never once per frame.
const keyName = (channel: number): string => Keyboard[channel as Keyboard] ?? `Channel ${channel}`;

class KeyboardScene extends Scene {
  private square!: Graphics;
  private position = { x: 400, y: 300 };
  private up!: InputBinding;
  private down!: InputBinding;
  private left!: InputBinding;
  private right!: InputBinding;
  private hud!: ReturnType<typeof mountControls>;
  private held = 'none';
  private readonly onKeyDown = (channel: number): void => console.log(`KeyDown: ${keyName(channel)}`);

  override init(): void {
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
      console.info('Action: Recentre');
    });

    app.input.onKeyDown.add(this.onKeyDown);
    this.hud = mountControls({ status: 'Held: none' });
  }

  override update(delta: Seconds): void {
    const app = this.app;
    const { width, height } = app;
    const speed = 280 * delta;
    const moveX = (this.right.active ? 1 : 0) - (this.left.active ? 1 : 0);
    const moveY = (this.down.active ? 1 : 0) - (this.up.active ? 1 : 0);

    this.position.x = Math.max(20, Math.min(width - 20, this.position.x + moveX * speed));
    this.position.y = Math.max(20, Math.min(height - 20, this.position.y + moveY * speed));

    const held = [this.up.active && 'Up', this.down.active && 'Down', this.left.active && 'Left', this.right.active && 'Right'].filter(
      Boolean,
    );

    const label = held.length ? held.join(' + ') : 'none';

    if (label !== this.held) {
      this.held = label;
      this.hud.setStatus(`Held: ${label}`);
      console.log(`Held: ${label}`);
    }
  }

  override draw(context: RenderingContext): void {
    this.square.clear();
    this.square.fillColor = new Color(120, 200, 255);
    this.square.drawRectangle(this.position.x - 20, this.position.y - 20, 40, 40);
    context.render(this.square);
  }

  override destroy(): void {
    this.app.input.onKeyDown.remove(this.onKeyDown);
    this.hud.dispose();
    super.destroy();
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
});

await app.start(KeyboardScene);
