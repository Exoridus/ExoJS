// Auto-generated from pause-blur.ts — edit the .ts source, not this file.
import { Application, BlurFilter, Color, Keyboard, Scene, Sprite, Text, Texture } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});
const PAUSE_BLUR_RADIUS = 6;
const PAUSE_FADE_SECONDS = 0.35;
class GameScene extends Scene {
    sprite;
    time = 0;
    hud;
    async load(loader) {
        await loader.load(Texture, { ship: 'image/ship-a.png' });
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this.sprite = new Sprite(loader.get(Texture, 'ship')).setAnchor(0.5).setScale(2).setPosition(width / 2, height / 2);
        this.addChild(this.sprite);
        this.hud = mountControls({
            title: 'Pause Blur',
            controls: [{ keys: 'Esc', action: 'pause / resume' }],
            hint: 'Press Esc to pause — the scene blurs up behind the menu.',
        });
        this.inputs.onTrigger(Keyboard.Escape, async () => {
            if (pauseScene.app !== null)
                return;
            await this.app.scene.pushScene(pauseScene, { mode: 'overlay' });
        });
    }
    update(delta) {
        this.time += delta.seconds;
        this.sprite.setRotation(this.time * 80);
    }
    draw(context) {
        context.backend.clear(new Color(20, 24, 34));
        context.render(this.root);
    }
}
class PauseScene extends Scene {
    blur;
    text;
    init() {
        const { width, height } = this.app.canvas;
        // Start fully sharp and tween the radius up so the blur genuinely fades
        // in rather than snapping on. The global TweenManager keeps ticking while
        // this overlay scene is on the stack.
        this.blur = new BlurFilter({ radius: 0, quality: 2 });
        gameScene.root.filters = [this.blur];
        this.tweens.create(this.blur).to({ radius: PAUSE_BLUR_RADIUS }, PAUSE_FADE_SECONDS).start();
        this.text = new Text('PAUSED', { fillColor: Color.white, fontSize: 64, fontWeight: 'bold', align: 'center' });
        this.text.setAnchor(0.5, 0.5);
        this.text.setPosition(width / 2, height / 2);
        this.inputs.onTrigger(Keyboard.Escape, async () => {
            await this.app.scene.popScene();
        });
    }
    draw(context) {
        context.render(this.text);
    }
    destroy() {
        gameScene.root.clearFilters();
        super.destroy();
    }
}
const gameScene = new GameScene();
const pauseScene = new PauseScene();
void app.start(gameScene);
