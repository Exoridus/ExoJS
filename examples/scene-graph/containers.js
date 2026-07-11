// Auto-generated from containers.ts — edit the .ts source, not this file.
import { Application, Asset, Assets, Color, Container, Scene, Sprite } from '@codexo/exojs';
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
class ContainersScene extends Scene {
    rainbow;
    bunnies;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        const { bunny, rainbow } = this.loader.get(Assets.from({ bunny: Asset.kind('texture', 'image/ship-a.png'), rainbow: Asset.kind('texture', 'image/hue-ramp.png') }));
        this.rainbow = new Sprite(rainbow);
        this.bunnies = new Container();
        this.bunnies.setPosition((width / 2) | 0, (height / 2) | 0);
        for (let i = 0; i < 25; i++) {
            const sprite = new Sprite(bunny);
            sprite.setPosition((i % 5) * (sprite.width + 15), ((i / 5) | 0) * (sprite.height + 10));
            this.bunnies.addChild(sprite);
        }
        this.bunnies.setAnchor(0.5);
    }
    update(delta) {
        const bounds = this.bunnies.getBounds();
        this.rainbow.x = bounds.x;
        this.rainbow.y = bounds.y;
        this.rainbow.width = bounds.width;
        this.rainbow.height = bounds.height;
        this.bunnies.rotate(delta.seconds * 36);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.rainbow);
        context.render(this.bunnies);
    }
}
app.start(new ContainersScene());
