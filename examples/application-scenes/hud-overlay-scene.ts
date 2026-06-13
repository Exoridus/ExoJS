import { Application, Color, Graphics, Scene, Text } from '@codexo/exojs';

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

class GameScene extends Scene {
    private angle = 0;
    private ring!: Graphics;

    override init(): void {
        this.ring = new Graphics();
    }

    override update(delta): void {
        this.angle += delta.seconds * 90;
    }

    override draw(context): void {
        const { width, height } = this.app.canvas;

        context.backend.clear(new Color(20, 32, 58));
        this.ring.clear();
        this.ring.lineWidth = 20;
        this.ring.lineColor = new Color(90, 180, 255);
        this.ring.drawArc(width / 2, height / 2, 160, 0, (this.angle * Math.PI) / 180);
        context.render(this.ring);
    }
}

class HudScene extends Scene {
    private bar!: Graphics;
    private text!: Text;

    override init(): void {
        this.bar = new Graphics();
        this.text = new Text('HUD Overlay', { fillColor: Color.white, fontSize: 22 });
        this.text.setPosition(18, 14);
    }

    override draw(context): void {
        const { width } = this.app.canvas;

        this.bar.clear();
        this.bar.fillColor = new Color(0, 0, 0, 0.45);
        this.bar.drawRectangle(0, 0, width, 56);
        this.bar.fillColor = new Color(80, 220, 120);
        this.bar.drawRectangle(18, 40, 220, 8);
        context.render(this.bar);
        context.render(this.text);
    }
}

const gameScene = new GameScene();
const hudScene = new HudScene();

void app.start(gameScene).then(() => app.scene.pushScene(hudScene, { mode: 'overlay' }));
