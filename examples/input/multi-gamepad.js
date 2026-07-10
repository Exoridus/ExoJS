// Auto-generated from multi-gamepad.ts — edit the .ts source, not this file.
import { Application, Color, GamepadAxis, Scene, Sprite, Text } from '@codexo/exojs';
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
const tints = [new Color(255, 140, 140), new Color(140, 255, 170), new Color(150, 180, 255), new Color(255, 230, 140)];
// Each of the four stable gamepad slots gets its own ship and its own left-stick
// bindings. Bindings persist across connect/disconnect, so we set them up once;
// only *connected* pads are moved and drawn, and an empty canvas shows a
// "connect a controller" prompt instead of a row of motionless ships.
class MultiGamepadScene extends Scene {
    players = [];
    hasPad = false;
    connectPrompt;
    hud;
    init() {
        const { width, height } = this.app.canvas;
        this.players = this.app.input.gamepads.map((pad, index) => {
            const sprite = new Sprite(this.loader.get('image/ship-a.png'))
                .setAnchor(0.5)
                .setScale(0.6)
                .setPosition(width * (0.2 + index * 0.2), height / 2)
                .setTint(tints[index]);
            const move = { x: 0, y: 0 };
            pad.onActive(GamepadAxis.LeftStickX, (value) => (move.x = value));
            pad.onStop(GamepadAxis.LeftStickX, () => (move.x = 0));
            pad.onActive(GamepadAxis.LeftStickY, (value) => (move.y = value));
            pad.onStop(GamepadAxis.LeftStickY, () => (move.y = 0));
            return { pad, sprite, move };
        });
        // Track controller presence with the engine's connect/disconnect signals
        // and prompt with an on-screen Text while none is attached.
        this.hasPad = this.app.input.gamepads.some(pad => pad.connected);
        this.app.input.onGamepadConnected.add(() => (this.hasPad = true));
        this.app.input.onGamepadDisconnected.add(() => (this.hasPad = this.app.input.gamepads.some(pad => pad.connected)));
        this.connectPrompt = new Text('Connect one or more controllers to play', { fillColor: Color.white, fontSize: 24, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height / 2);
        this.hud = mountControls({
            title: 'Multi Gamepad',
            controls: [{ keys: 'L-Stick', action: 'move that pad’s ship' }],
            status: '',
            hint: 'Up to four pads, one coloured ship each.',
        });
        this.refreshHud();
        this.app.input.onGamepadConnected.add(() => this.refreshHud());
        this.app.input.onGamepadDisconnected.add(() => this.refreshHud());
    }
    refreshHud() {
        const lines = this.players.map((player, index) => {
            const label = player.pad.connected ? (player.pad.info?.label ?? player.pad.info?.name ?? 'connected') : 'empty';
            return `P${index + 1}: ${label}`;
        });
        this.hud.setStatus(lines.join(' · '));
    }
    update(delta) {
        for (const player of this.players) {
            if (!player.pad.connected) {
                continue;
            }
            player.sprite.move(player.move.x * 260 * delta.seconds, player.move.y * 260 * delta.seconds);
        }
    }
    draw(context) {
        context.backend.clear();
        for (const player of this.players) {
            if (player.pad.connected) {
                context.render(player.sprite);
            }
        }
        if (!this.hasPad) {
            context.render(this.connectPrompt);
        }
    }
}
app.start(new MultiGamepadScene());
