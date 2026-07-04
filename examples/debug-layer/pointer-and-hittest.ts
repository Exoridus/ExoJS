import { Application, Color, Scene, Sprite, Texture } from '@codexo/exojs';
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
debug.layers.hitTest.visible = true;
debug.layers.pointerStack.visible = true;

class PointerAndHittestScene extends Scene {
    private sprites!: Sprite[];

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.sprites = [];
        for (let i = 0; i < 5; i++) {
            const sprite = new Sprite(loader.get(Texture, 'bunny'))
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

    override draw(context): void {
        context.backend.clear();
        context.render(this.root);
    }
}

app.start(new PointerAndHittestScene());
