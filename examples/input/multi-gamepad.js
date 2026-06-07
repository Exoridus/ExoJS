// Auto-generated from multi-gamepad.ts — edit the .ts source, not this file.
import { Application, Color, GamepadAxis, Scene, Sprite, Texture } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});
document.body.append(app.canvas);
const tints = [new Color(255, 140, 140), new Color(140, 255, 170), new Color(150, 180, 255), new Color(255, 230, 140)];
class MultiGamepadScene extends Scene {
    players;
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }
    init(loader) {
        this.players = app.input.gamepads.map((pad, index) => {
            const sprite = new Sprite(loader.get(Texture, 'bunny'))
                .setAnchor(0.5)
                .setScale(0.6)
                .setPosition(160 + index * 160, 300)
                .setTint(tints[index]);
            const move = { x: 0, y: 0 };
            pad.onActive(GamepadAxis.LeftStickX, (value) => {
                move.x = value;
            });
            pad.onStop(GamepadAxis.LeftStickX, () => {
                move.x = 0;
            });
            pad.onActive(GamepadAxis.LeftStickY, (value) => {
                move.y = value;
            });
            pad.onStop(GamepadAxis.LeftStickY, () => {
                move.y = 0;
            });
            return { pad, sprite, move };
        });
    }
    update(delta) {
        for (const player of this.players) {
            if (!player.pad.connected)
                continue;
            player.sprite.move(player.move.x * 260 * delta.seconds, player.move.y * 260 * delta.seconds);
        }
    }
    draw(context) {
        context.backend.clear();
        for (const player of this.players) {
            context.render(player.sprite);
        }
    }
}
app.start(new MultiGamepadScene());
