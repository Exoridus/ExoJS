// Auto-generated from hello-world.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Sprite } from '@codexo/exojs';
// #region guide:first-scene
class HelloWorldScene extends Scene {
    sprite;
    init() {
        const app = this.app;
        const { width, height } = app;
        this.sprite = new Sprite(this.loader.get('image/ship-a.png'));
        this.sprite.setAnchor(0.5);
        this.sprite.setPosition(width / 2, height / 2);
    }
    draw(context) {
        context.render(this.sprite);
    }
}
// #endregion guide:first-scene
const app = new Application({
    scenes: { HelloWorldScene },
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
app.start(HelloWorldScene);
