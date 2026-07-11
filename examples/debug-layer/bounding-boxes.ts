import { Application, Color, type RenderingContext, Scene, Sprite, type Time } from '@codexo/exojs';
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
    private sprites!: { sprite: Sprite; speed: number }[];
    private time = 0;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
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

    override update(delta: Time): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { height } = app.canvas;

        this.time += delta.seconds;
        for (const { sprite, speed } of this.sprites) {
            sprite.setRotation(this.time * 35 * speed);
            sprite.setPosition(sprite.position.x, height / 2 + Math.sin(this.time * speed) * 100);
        }
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.root);
    }
}

app.start(new BoundingBoxesScene());
