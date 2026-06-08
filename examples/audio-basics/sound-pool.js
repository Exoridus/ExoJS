// Auto-generated from sound-pool.ts — edit the .ts source, not this file.
import { assets } from '@assets';
import { Application, Color, Keyboard, Scene, Sound, Text } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});
document.body.append(app.canvas);
class SoundPoolScene extends Scene {
    sound;
    label;
    firing = false;
    timer = 0;
    async load(loader) {
        await loader.load(Sound, { shot: assets.demo.audio.uiClick });
    }
    init(loader) {
        this.sound = loader.get(Sound, 'shot');
        this.sound.poolSize = 24;
        this.label = new Text('Hold Space to fire SFX rapidly', { fillColor: Color.white, fontSize: 24 });
        this.label.setPosition(190, 280);
        this.inputs.onActive(Keyboard.Space, () => {
            this.firing = true;
        });
        this.inputs.onStop(Keyboard.Space, () => {
            this.firing = false;
        });
    }
    update(delta) {
        if (!this.firing)
            return;
        this.timer += delta.seconds;
        while (this.timer >= 0.05) {
            this.timer -= 0.05;
            this.sound.play();
        }
    }
    draw(context) {
        context.backend.clear();
        context.render(this.label);
    }
}
app.start(new SoundPoolScene());
