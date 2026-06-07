// Auto-generated from action-mapping.ts — edit the .ts source, not this file.
import { Application, Color, GamepadAxis, GamepadButton, Keyboard, Scene, Sprite, Texture } from '@codexo/exojs';
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
class ActionMappingScene extends Scene {
    sprite;
    keys = { a: 0, d: 0, w: 0, s: 0 };
    stick = { x: 0, y: 0 };
    jumpImpulse = 0;
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }
    init(loader) {
        this.sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 300);
        const pad0 = this.app.input.getGamepad(0);
        this.inputs.onActive(Keyboard.A, () => {
            this.keys.a = 1;
        });
        this.inputs.onStop(Keyboard.A, () => {
            this.keys.a = 0;
        });
        this.inputs.onActive(Keyboard.D, () => {
            this.keys.d = 1;
        });
        this.inputs.onStop(Keyboard.D, () => {
            this.keys.d = 0;
        });
        this.inputs.onActive(Keyboard.W, () => {
            this.keys.w = 1;
        });
        this.inputs.onStop(Keyboard.W, () => {
            this.keys.w = 0;
        });
        this.inputs.onActive(Keyboard.S, () => {
            this.keys.s = 1;
        });
        this.inputs.onStop(Keyboard.S, () => {
            this.keys.s = 0;
        });
        this.inputs.onTrigger(Keyboard.Space, () => {
            this.jumpImpulse = -220;
        });
        pad0.onTrigger(GamepadButton.South, () => {
            this.jumpImpulse = -220;
        });
        pad0.onActive(GamepadAxis.LeftStickX, value => {
            this.stick.x = value;
        });
        pad0.onStop(GamepadAxis.LeftStickX, () => {
            this.stick.x = 0;
        });
        pad0.onActive(GamepadAxis.LeftStickY, value => {
            this.stick.y = value;
        });
        pad0.onStop(GamepadAxis.LeftStickY, () => {
            this.stick.y = 0;
        });
    }
    update(delta) {
        const keyX = this.keys.d - this.keys.a;
        const keyY = this.keys.s - this.keys.w;
        const moveX = Math.abs(this.stick.x) > Math.abs(keyX) ? this.stick.x : keyX;
        const moveY = Math.abs(this.stick.y) > Math.abs(keyY) ? this.stick.y : keyY;
        this.sprite.move(moveX * 260 * delta.seconds, moveY * 260 * delta.seconds);
        this.sprite.move(0, this.jumpImpulse * delta.seconds);
        this.jumpImpulse = Math.min(0, this.jumpImpulse + 800 * delta.seconds);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
    }
}
app.start(new ActionMappingScene());
