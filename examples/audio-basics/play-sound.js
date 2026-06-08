// Auto-generated from play-sound.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Sound, Text } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});
document.body.append(app.canvas);
class PlaySoundScene extends Scene {
    sound;
    text;
    async load(loader) {
        await loader.load(Sound, { click: assets.demo.audio.uiClick });
    }
    init(loader) {
        this.sound = loader.get(Sound, 'click');
        this.text = new Text('Click anywhere to play SFX', { fillColor: Color.white, fontSize: 24 });
        this.text.setPosition(220, 280);
        this.app.input.onPointerTap.add(() => {
            this.sound.play();
        });
    }
    draw(context) {
        context.backend.clear();
        context.render(this.text);
    }
}
app.start(new PlaySoundScene());
