// Auto-generated from typewriter-text.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Text } from '@codexo/exojs';
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
const message = 'ExoJS gives you explicit rendering control with a compact scene and asset workflow.';
class TypewriterTextScene extends Scene {
    sound;
    text;
    state;
    last = 0;
    tapPrompt;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        this.sound = this.loader.get('audio/ui-click.ogg');
        this.text = new Text('', { fillColor: Color.white, fontSize: 40, lineHeight: 56, maxWidth: 900 });
        this.text.setAnchor(0, 0.5).setPosition(width * 0.12, height / 2);
        this.state = { count: 0 };
        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it and the queued tick sounds play.
        this.tapPrompt = new Text('Click or press any key to enable the typing sound', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 64);
        app.tweens
            .create(this.state)
            .to({ count: message.length }, 2.4)
            .onUpdate(() => {
            const n = this.state.count | 0;
            if (n > this.last)
                app.audio.play(this.sound, { playbackRate: 1.6 });
            this.last = n;
            this.text.text = message.slice(0, n);
        })
            .start();
    }
    draw(context) {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        context.backend.clear();
        context.render(this.text);
        if (app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}
app.start(new TypewriterTextScene());
