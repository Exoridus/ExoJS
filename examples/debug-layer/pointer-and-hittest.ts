import { Application, Color, type RenderingContext, Scene, Sprite } from '@codexo/exojs';
import { DebugOverlay } from '@codexo/exojs/debug';



class PointerAndHittestScene extends Scene {
    private sprites!: Sprite[];

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.sprites = [];
        for (let i = 0; i < 5; i++) {
            const sprite = new Sprite(this.loader.get('image/ship-a.png'))
                .setAnchor(0.5)
                .setScale(1.2)
                .setPosition(width / 2 - 120 + i * 60, height / 2 - 20 + (i % 2) * 40);
            sprite.zIndex = i;
            sprite.interactive = true;
            sprite.draggable = true;
            sprite.setTint(
                [new Color(255, 130, 130), new Color(130, 255, 170), new Color(140, 190, 255), new Color(255, 230, 130), new Color(220, 140, 255)][i],
            );
            // The hitTest layer (and the interaction manager itself) walk the
            // scene graph, so interactive nodes must live under scene.root.
            this.root.addChild(sprite);
            this.sprites.push(sprite);
        }
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.root);
    }
}

const app = new Application({
    scenes: { PointerAndHittestScene },
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
debug.layers.hitTest.visible = true;
debug.layers.pointerStack.visible = true;

app.start(PointerAndHittestScene);
