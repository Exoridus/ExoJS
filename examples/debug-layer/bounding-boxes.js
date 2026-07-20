// Auto-generated from bounding-boxes.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Sprite } from '@codexo/exojs';
import { DebugOverlay } from '@codexo/exojs/debug';
class BoundingBoxesScene extends Scene {
    sprites;
    time = 0;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        const count = 7;
        const margin = width * 0.12;
        const step = (width - 2 * margin) / (count - 1);
        this.sprites = Array.from({ length: count }, (_, i) => {
            const sprite = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5).setScale(0.8);
            sprite.setPosition(margin + i * step, height / 2 + Math.sin(i) * 80);
            // The boundingBoxes layer walks the SCENE GRAPH (scene.root), so
            // the sprites must be attached to it — nodes that are only passed
            // to context.render() directly are invisible to the overlay.
            this.root.addChild(sprite);
            return { sprite, speed: 0.8 + i * 0.14 };
        });
    }
    update(delta) {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { height } = app.canvas;
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
const app = new Application({
    scenes: { BoundingBoxesScene },
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
app.start(BoundingBoxesScene);
