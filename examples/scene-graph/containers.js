// Auto-generated from containers.ts — edit the .ts source, not this file.
import { Application, Color, Container, Scene, Sprite, Texture } from '@codexo/exojs';
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
    async load(loader) {
        await loader.load(Texture, {
            bunny: 'image/ship-a.png',
            rainbow: 'image/hue-ramp.png',
        });
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this.rainbow = new Sprite(loader.get(Texture, 'rainbow'));
        this.bunnies = new Container();
        this.bunnies.setPosition((width / 2) | 0, (height / 2) | 0);
        for (let i = 0; i < 25; i++) {
            const bunny = new Sprite(loader.get(Texture, 'bunny'));
            bunny.setPosition((i % 5) * (bunny.width + 15), ((i / 5) | 0) * (bunny.height + 10));
            this.bunnies.addChild(bunny);
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
