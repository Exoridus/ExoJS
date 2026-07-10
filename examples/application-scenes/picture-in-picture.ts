import { Application, Color, Graphics, Scene, Sprite, View } from '@codexo/exojs';

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

class PictureInPictureScene extends Scene {
    private mainView!: View;
    private pipView!: View;
    private sprite!: Sprite;
    private velocity = 220;
    private frame!: Graphics;

    override init(): void {
        const { width, height } = this.app.canvas;

        this.sprite = new Sprite(this.loader.get('image/ship-a.png'));

        this.mainView = new View(0, 0, width, height);
        this.pipView = new View(0, 0, width * 0.3, height * 0.3).setViewport(0.68, 0.04, 0.28, 0.28);
        // Zoom < 1 zooms OUT (a larger visible world area maps into the same
        // small viewport) — a minimap needs to show more of the scene than the
        // main view, not less, so the tracked sprite reads as a small icon.
        this.pipView.setZoom(0.4);

        this.sprite.setAnchor(0.5).setPosition(-280, 0);

        this.frame = new Graphics();
        this.frame.lineWidth = 3;
        this.frame.lineColor = Color.white;
        this.frame.drawRectangle(width * 0.68, height * 0.04, width * 0.28, height * 0.28);
    }

    override update(delta): void {
        this.sprite.move(this.velocity * delta.seconds, 0);

        if (this.sprite.position.x > 320 || this.sprite.position.x < -320) {
            this.velocity *= -1;
        }

        this.pipView.follow(this.sprite, { lerp: 1 });
    }

    override draw(context): void {
        context.clear(Color.black);
        context.render(this.sprite, { view: this.mainView });
        context.render(this.sprite, { view: this.pipView });
        context.render(this.frame, { view: context.screenView });
    }
}

app.start(new PictureInPictureScene());
