// Auto-generated from game-loop.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Sprite, Texture } from '@codexo/exojs';
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
class GameLoopScene extends Scene {
    sprite;
    async load(loader) {
        this.sprite = new Sprite(await loader.load(Texture, 'image/ship-a.png'));
    }
    init() {
        const { width, height } = this.app.canvas;
        this.sprite.setAnchor(0.5);
        this.sprite.setPosition(width / 2, height / 2);
    }
    update(delta) {
        this.sprite.rotate(delta.seconds * 120);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
    }
}
app.start(new GameLoopScene());
