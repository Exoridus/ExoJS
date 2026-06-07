import { audio } from '@assets';
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
    private sound!: Sound;
    private label!: Text;
    private firing = false;
    private timer = 0;

    override async load(loader): Promise<void> {
        await loader.load(Sound, { shot: audio.uiClick });
    }

    override init(loader): void {
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

    override update(delta): void {
        if (!this.firing) return;
        this.timer += delta.seconds;
        while (this.timer >= 0.05) {
            this.timer -= 0.05;
            this.sound.play();
        }
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.label);
    }
}

app.start(new SoundPoolScene());
