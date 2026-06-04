import { Application, Color, Scene, Sound, Text } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 840,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

document.body.append(app.canvas);

const message = 'ExoJS gives you explicit rendering control with a compact scene and asset workflow.';

class TypewriterTextScene extends Scene {
    private _sound!: Sound;
    private _text!: Text;
    private _state!: { count: number };
    private _last = 0;

    override async load(loader): Promise<void> {
        await loader.load(Sound, { tick: 'audio/ui-click.ogg' });
    }

    override init(loader): void {
        this._sound = loader.get(Sound, 'tick');
        this._text = new Text('', { fillColor: Color.white, fontSize: 30, lineHeight: 42 }, { maxWidth: 720 });
        this._text.setPosition(60, 190);
        this._state = { count: 0 };
        this.app.tweens
            .create(this._state)
            .to({ count: message.length }, 2.4)
            .onUpdate(() => {
                const n = this._state.count | 0;
                if (n > this._last) this._sound.play({ playbackRate: 1.6 });
                this._last = n;
                this._text.text = message.slice(0, n);
            })
            .start();
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._text);
    }
}

app.start(new TypewriterTextScene());
