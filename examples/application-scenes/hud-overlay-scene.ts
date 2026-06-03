import { Application, Color, Graphics, Scene, Text } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

document.body.append(app.canvas);

class GameScene extends Scene {
    private _angle = 0;
    private _ring!: Graphics;

    override init(): void {
        this._ring = new Graphics();
    }

    override update(delta): void {
        this._angle += delta.seconds * 90;
    }

    override draw(context): void {
        context.backend.clear(new Color(20, 32, 58));
        this._ring.clear();
        this._ring.lineWidth = 20;
        this._ring.lineColor = new Color(90, 180, 255);
        this._ring.drawArc(400, 300, 160, 0, (this._angle * Math.PI) / 180);
        context.render(this._ring);
    }
}

class HudScene extends Scene {
    private _bar!: Graphics;
    private _text!: Text;

    override init(): void {
        this._bar = new Graphics();
        this._text = new Text('HUD Overlay', { fillColor: Color.white, fontSize: 22 });
        this._text.setPosition(18, 14);
    }

    override draw(context): void {
        this._bar.clear();
        this._bar.fillColor = new Color(0, 0, 0, 0.45);
        this._bar.drawRectangle(0, 0, 800, 56);
        this._bar.fillColor = new Color(80, 220, 120);
        this._bar.drawRectangle(18, 40, 220, 8);
        context.render(this._bar);
        context.render(this._text);
    }
}

const gameScene = new GameScene();
const hudScene = new HudScene();

void app.start(gameScene).then(() => app.scene.pushScene(hudScene, { mode: 'overlay' }));
