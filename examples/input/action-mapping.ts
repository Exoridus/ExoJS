import { Application, Color, GamepadAxis, GamepadButton, Keyboard, Scene, Sprite } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: new Color(10, 12, 20),
    loader: {
        basePath: 'assets/',
    },
});

// The lesson: bind several *physical* inputs to a few *named actions*, then read
// only the actions in the update loop. Keyboard and gamepad feed the same
// `moveX` / `moveY` / `jump` values, so the gameplay code never branches on the
// device. Whichever device pushes a control harder this frame wins — so you can
// pick up either input mid-motion without a mode switch.
class ActionMappingScene extends Scene {
    private sprite!: Sprite;
    private keys = { left: 0, right: 0, up: 0, down: 0 };
    private stick = { x: 0, y: 0 };
    private jumpImpulse = 0;
    private lastDevice = 'keyboard';
    private actions = { moveX: 0, moveY: 0, jump: false };
    private hud!: ReturnType<typeof mountControls>;

    override init(): void {
        const { width, height } = this.app.canvas;

        this.sprite = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5).setPosition(width / 2, height / 2);

        const pad0 = this.app.input.getGamepad(0);

        // --- Move action: keyboard WASD/arrows feed key axes ---
        this.inputs.onActive([Keyboard.A, Keyboard.Left], () => (this.keys.left = 1));
        this.inputs.onStop([Keyboard.A, Keyboard.Left], () => (this.keys.left = 0));
        this.inputs.onActive([Keyboard.D, Keyboard.Right], () => (this.keys.right = 1));
        this.inputs.onStop([Keyboard.D, Keyboard.Right], () => (this.keys.right = 0));
        this.inputs.onActive([Keyboard.W, Keyboard.Up], () => (this.keys.up = 1));
        this.inputs.onStop([Keyboard.W, Keyboard.Up], () => (this.keys.up = 0));
        this.inputs.onActive([Keyboard.S, Keyboard.Down], () => (this.keys.down = 1));
        this.inputs.onStop([Keyboard.S, Keyboard.Down], () => (this.keys.down = 0));

        // --- Move action: gamepad left stick feeds the same axes ---
        pad0.onActive(GamepadAxis.LeftStickX, value => (this.stick.x = value));
        pad0.onStop(GamepadAxis.LeftStickX, () => (this.stick.x = 0));
        pad0.onActive(GamepadAxis.LeftStickY, value => (this.stick.y = value));
        pad0.onStop(GamepadAxis.LeftStickY, () => (this.stick.y = 0));

        // --- Jump action: Space OR the South button, one shared impulse ---
        this.inputs.onStart(Keyboard.Space, () => this.queueJump('keyboard'));
        pad0.onStart(GamepadButton.South, () => this.queueJump('gamepad'));

        this.hud = mountControls({
            title: 'Action Mapping',
            controls: [
                { keys: ['W', 'A', 'S', 'D'], action: 'Move (keyboard)' },
                { keys: 'L-Stick', action: 'Move (gamepad)' },
                { keys: ['Space', 'A'], action: 'Jump (either device)' },
            ],
            status: 'Move 0.00, 0.00 · Jump idle',
            hint: 'Driven by: keyboard',
        });
    }

    private queueJump(device: string): void {
        this.jumpImpulse = -220;
        this.lastDevice = device;
    }

    override update(delta): void {
        const keyX = this.keys.right - this.keys.left;
        const keyY = this.keys.down - this.keys.up;

        // Resolve each named action from whichever device is pushing hardest.
        this.actions.moveX = Math.abs(this.stick.x) > Math.abs(keyX) ? this.stick.x : keyX;
        this.actions.moveY = Math.abs(this.stick.y) > Math.abs(keyY) ? this.stick.y : keyY;
        this.actions.jump = this.jumpImpulse < 0;

        if (this.actions.moveX !== 0 || this.actions.moveY !== 0) {
            this.lastDevice = Math.abs(this.stick.x) > Math.abs(keyX) || Math.abs(this.stick.y) > Math.abs(keyY) ? 'gamepad' : 'keyboard';
        }

        this.sprite.move(this.actions.moveX * 260 * delta.seconds, this.actions.moveY * 260 * delta.seconds);
        this.sprite.move(0, this.jumpImpulse * delta.seconds);
        this.jumpImpulse = Math.min(0, this.jumpImpulse + 800 * delta.seconds);

        this.hud.setStatus(`Move ${this.actions.moveX.toFixed(2)}, ${this.actions.moveY.toFixed(2)} · Jump ${this.actions.jump ? 'active' : 'idle'}`);
        this.hud.setHint(`Driven by: ${this.lastDevice}`);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.sprite);
    }
}

app.start(new ActionMappingScene());
