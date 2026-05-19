import { Application, Color, Keyboard, Scene, Text } from '@codexo/exojs';

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

class MenuScene extends Scene {
    init() {
        const { width, height } = this.app.canvas;
        this._label = new Text('MENU\nClick to Start', { align: 'center', fill: 'white', fontSize: 34 });
        this._label.setAnchor(0.5);
        this._label.setPosition(width / 2, height / 2);
        this.inputs.onTrigger(Keyboard.Space, () => {
            void this.app.sceneManager.setScene(gameScene);
        });
        this.app.input.onPointerTap.add(this._onTap, this);
    }
    _onTap() {
        void this.app.sceneManager.setScene(gameScene);
    }
    draw(backend) {
        backend.clear(new Color(18, 38, 72, 1));
        this._label.render(backend);
    }
    destroy() {
        this.app.input.onPointerTap.remove(this._onTap, this);
        super.destroy();
    }
}

class GameScene extends Scene {
    init() {
        const { width, height } = this.app.canvas;
        this._label = new Text('GAME\nEsc to Menu', { align: 'center', fill: 'white', fontSize: 34 });
        this._label.setAnchor(0.5);
        this._label.setPosition(width / 2, height / 2);
        this.inputs.onTrigger(Keyboard.Escape, () => {
            void this.app.sceneManager.setScene(menuScene);
        });
    }
    draw(backend) {
        backend.clear(new Color(24, 72, 42, 1));
        this._label.render(backend);
    }
}

const menuScene = new MenuScene();
const gameScene = new GameScene();

app.start(menuScene);
