// Auto-generated from bounding-boxes.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Sprite } from '@codexo/exojs';
import { DebugOverlay } from '@codexo/exojs/debug';
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
const debug = new DebugOverlay(app);
debug.layers.boundingBoxes.visible = true;
class BoundingBoxesScene extends Scene {
    sprites;
    time = 0;
    async load(loader) {
        await loader.load('image/ship-a.png');
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        const count = 7;
        const margin = width * 0.12;
        const step = (width - 2 * margin) / (count - 1);
        this.sprites = Array.from({ length: count }, (_, i) => {
            const sprite = new Sprite(loader.get('image/ship-a.png')).setAnchor(0.5).setScale(0.8);
            sprite.setPosition(margin + i * step, height / 2 + Math.sin(i) * 80);
            // The boundingBoxes layer walks the SCENE GRAPH (scene.root), so
            // the sprites must be attached to it — nodes that are only passed
            // to context.render() directly are invisible to the overlay.
            this.root.addChild(sprite);
            return { sprite, speed: 0.8 + i * 0.14 };
        });
    }
    update(delta) {
        const { height } = this.app.canvas;
        this.time += delta.seconds;
        for (const { sprite, speed } of this.sprites) {
            sprite.setRotation(this.time * 35 * speed);
            sprite.setPosition(sprite.position.x, height / 2 + Math.sin(this.time * speed) * 100);
        }
    }
    draw(context) {
        context.backend.clear();
        context.render(this.root);
    }
}
app.start(new BoundingBoxesScene());
