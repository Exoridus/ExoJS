// Auto-generated from hello-world.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Sprite, Texture } from '@codexo/exojs';
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
// #region guide:first-scene
class HelloWorldScene extends Scene {
    sprite;
    async load(loader) {
        this.sprite = new Sprite(await loader.load(Texture, 'image/ship-a.png'));
    }
    init() {
        const { width, height } = this.app.canvas;
        this.sprite.setAnchor(0.5);
        this.sprite.setPosition(width / 2, height / 2);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
    }
}
// #endregion guide:first-scene
app.start(new HelloWorldScene());
