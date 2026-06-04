import { Application, BlurFilter, Color, Keyboard, Scene, Sprite, Text, Texture } from '@codexo/exojs';

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
    private _sprite!: Sprite;
    private _time = 0;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setScale(2).setPosition(400, 300);
        this.addChild(this._sprite);
        this.inputs.onTrigger(Keyboard.Escape, async () => {
            if (pauseScene.app !== null) return;
            await this.app.scene.pushScene(pauseScene, { mode: 'overlay' });
        });
    }

    override update(delta): void {
        this._time += delta.seconds;
        this._sprite.setRotation(this._time * 80);
    }

    override draw(context): void {
        context.backend.clear(new Color(20, 24, 34));
        context.render(this.root);
    }
}

class PauseScene extends Scene {
    private _blur!: BlurFilter;
    private _text!: Text;

    override init(): void {
        this._blur = new BlurFilter({ radius: 5, quality: 2 });
        gameScene.root.filters = [this._blur];
        this._text = new Text('PAUSED', { fillColor: Color.white, fontSize: 64, fontWeight: 'bold' });
        this._text.setPosition(280, 250);
        this.inputs.onTrigger(Keyboard.Escape, async () => {
            await this.app.scene.popScene();
        });
    }

    override draw(context): void {
        context.render(this._text);
    }

    override destroy(): void {
        gameScene.root.clearFilters();
        super.destroy();
    }
}

const gameScene = new GameScene();
const pauseScene = new PauseScene();

void app.start(gameScene);
