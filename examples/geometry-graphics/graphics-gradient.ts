import { Application, Color, Container, Graphics, LinearGradient, RadialGradient, Scene } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.midnightBlue,
});

document.body.append(app.canvas);

class GraphicsGradientScene extends Scene {
    private sceneRoot!: Container;
    private panel!: Graphics;
    private orb!: Graphics;
    private ring!: Graphics;
    private badge!: Graphics;

    override init(): void {
        const { width, height } = this.app.canvas;

        this.sceneRoot = new Container();
        this.sceneRoot.setPosition(width / 2, height / 2);

        this.panel = new Graphics();
        this.panel.fillStyle = new LinearGradient(
            [
                { offset: 0, color: new Color(255, 90, 40, 1) },
                { offset: 0.5, color: new Color(255, 210, 70, 1) },
                { offset: 1, color: new Color(70, 120, 255, 1) },
            ],
            [0, 0],
            [1, 1],
        );
        this.panel.drawRectangle(-190, -130, 380, 260);

        this.orb = new Graphics();
        this.orb.fillStyle = new RadialGradient(
            [
                { offset: 0, color: new Color(255, 255, 255, 1) },
                { offset: 0.4, color: new Color(120, 220, 255, 1) },
                { offset: 1, color: new Color(20, 40, 90, 1) },
            ],
            [0.5, 0.5],
            0.5,
        );
        this.orb.drawCircle(-96, -8, 56);

        this.ring = new Graphics();
        this.ring.lineWidth = 12;
        this.ring.strokeStyle = new RadialGradient(
            [
                { offset: 0, color: new Color(255, 240, 180, 1) },
                { offset: 1, color: new Color(255, 80, 160, 1) },
            ],
            [0.5, 0.5],
            0.5,
        );
        this.ring.drawArc(104, 8, 52, 0, Math.PI * 2);

        this.badge = new Graphics();
        this.badge.fillStyle = new LinearGradient([
            { offset: 0, color: new Color(180, 255, 200, 1) },
            { offset: 1, color: new Color(40, 160, 120, 1) },
        ]);
        this.badge.drawStar(0, 116, 5, 46, 20);

        this.sceneRoot.addChild(this.panel, this.orb, this.ring, this.badge);
    }

    override update(delta): void {
        this.sceneRoot.rotate(delta.seconds * 8);
        this.badge.rotate(delta.seconds * 60);
        this.orb.setScale(1 + Math.sin(this.app.activeTime.seconds * 2) * 0.06);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.sceneRoot);
    }

    override unload(): void {
        this.sceneRoot?.destroy();
    }

    override destroy(): void {
        this.unload();
    }
}

app.start(new GraphicsGradientScene()).catch(() => {
    app.canvas.remove();
    app.destroy();
});
