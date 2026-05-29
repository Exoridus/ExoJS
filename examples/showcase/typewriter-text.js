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

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Sound, { tick: 'audio/ui-click.ogg' });
        }
        init(loader) {
            this._sound = loader.get(Sound, 'tick');
            this._text = new Text('', { fill: 'white', fontSize: 30, wordWrap: true, wordWrapWidth: 720, lineHeight: 42 });
            this._text.setPosition(60, 190);
            this._state = { count: 0 };
            this._last = 0;
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
        draw(context) {
            context.backend.clear();
            context.render(this._text);
        }
    })()
);
