import { Application, Scene, Color, type SceneInputEvent } from 'exojs';

class GameScene extends Scene {}

class PauseScene extends Scene {
    public constructor() {
        super();

        this.setParticipationPolicy({
            mode: 'modal',
            input: 'capture',
        });
    }

    public override handleInput(event: SceneInputEvent): boolean | void {
        if (event.type === 'keyDown') {
            console.log('pause scene keyDown', event.channel);
        }
    }
}

async function main(): Promise<void> {
    const canvas = document.querySelector<HTMLCanvasElement>('#app');

    if (!canvas) {
        throw new Error('Missing #app canvas element.');
    }

    const app = new Application({
        canvas,
        width: 800,
        height: 450,
        clearColor: Color.cornflowerBlue,
    });

    await app.start(new GameScene());

    // Push pause as modal: gameplay remains visible, updates/input below are blocked.
    await app.sceneManager.pushScene(new PauseScene(), {
        mode: 'modal',
        input: 'capture',
        transition: { type: 'fade', duration: 220, color: Color.black },
    });

    // Later, remove pause overlay.
    await app.sceneManager.popScene({
        transition: { type: 'fade', duration: 180, color: Color.black },
    });
}

void main();
