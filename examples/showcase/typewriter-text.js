// Auto-generated from typewriter-text.ts — edit the .ts source, not this file.
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
    sound;
    text;
    state;
    last = 0;
    async load(loader) {
        await loader.load(Sound, { tick: 'audio/ui-click.ogg' });
    }
    init(loader) {
        this.sound = loader.get(Sound, 'tick');
        this.text = new Text('', { fillColor: Color.white, fontSize: 30, lineHeight: 42 }, { maxWidth: 720 });
        this.text.setPosition(60, 190);
        this.state = { count: 0 };
        this.app.tweens
            .create(this.state)
            .to({ count: message.length }, 2.4)
            .onUpdate(() => {
            const n = this.state.count | 0;
            if (n > this.last)
                this.sound.play({ playbackRate: 1.6 });
            this.last = n;
            this.text.text = message.slice(0, n);
        })
            .start();
    }
    draw(context) {
        context.backend.clear();
        context.render(this.text);
    }
}
app.start(new TypewriterTextScene());
