import { Application, Color, FixedResolutionCanvasSizing, type RenderingContext, Scene, Sprite, Tween } from '@codexo/exojs';



class InterruptAndReplaceScene extends Scene {
    private sprite!: Sprite;
    private moveTween: Tween | null = null;

    override init(): void {
        const app = this.app;
        const { width, height } = app;

        this.sprite = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5).setPosition(width / 2, height / 2);
        app.input.onPointerTap.add(pointer => {
            if (this.moveTween !== null) {
                this.moveTween.stop();
            }
            this.moveTween = app.tweens.create(this.sprite.position).to({ x: pointer.x, y: pointer.y }, 0.35).start();
        });
    }

    override draw(context: RenderingContext): void {
        context.render(this.sprite);
    }
}

const app = new Application({
    scenes: { InterruptAndReplaceScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizing: new FixedResolutionCanvasSizing(),
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

app.start(InterruptAndReplaceScene);
