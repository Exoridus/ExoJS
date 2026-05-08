import { Application, Color, Graphics, Scene, Text } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

class GameScene extends Scene {
    init() {
        this._angle = 0;
        this._ring = new Graphics();
    }
    update(delta) {
        this._angle += delta.seconds * 90;
    }
    draw(backend) {
        backend.clear(new Color(20, 32, 58));
        this._ring.clear();
        this._ring.lineWidth = 20;
        this._ring.lineColor = new Color(90, 180, 255);
        this._ring.drawArc(400, 300, 160, 0, (this._angle * Math.PI) / 180);
        this._ring.render(backend);
    }
}

class HudScene extends Scene {
    init() {
        this._bar = new Graphics();
        this._text = new Text('HUD Overlay', { fill: 'white', fontSize: 22 });
        this._text.setPosition(18, 14);
    }
    draw(backend) {
        this._bar.clear();
        this._bar.fillColor = new Color(0, 0, 0, 0.45);
        this._bar.drawRectangle(0, 0, 800, 56);
        this._bar.fillColor = new Color(80, 220, 120);
        this._bar.drawRectangle(18, 40, 220, 8);
        this._bar.render(backend);
        this._text.render(backend);
    }
}

const gameScene = new GameScene();
const hudScene = new HudScene();

void app.start(gameScene).then(() => app.sceneManager.pushScene(hudScene, { mode: 'overlay', input: 'transparent' }));
