// Auto-generated from pause-blur.ts — edit the .ts source, not this file.
import { Application, BlurFilter, Color, Keyboard, Scene, Sprite, Text, Texture } from '@codexo/exojs';
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
class GameScene extends Scene {
    sprite;
    time = 0;
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }
    init(loader) {
        this.sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setScale(2).setPosition(400, 300);
        this.addChild(this.sprite);
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
        this.blur = new BlurFilter({ radius: 5, quality: 2 });
        gameScene.root.filters = [this.blur];
        this.text = new Text('PAUSED', { fillColor: Color.white, fontSize: 64, fontWeight: 'bold' });
        this.text.setPosition(280, 250);
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
