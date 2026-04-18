import { Application, Scene, Graphics, Color, type SceneRenderRuntime } from 'exojs';

class HelloScene extends Scene {
    private readonly box = new Graphics();

    public constructor() {
        super();

        this.box.fillColor = Color.white;
        this.box.drawRectangle(-32, -32, 64, 64);
        this.box.setPosition(400, 300);

        this.addChild(this.box);
    }

    public override update(delta: import('exojs').Time): void {
        this.box.rotation += delta.seconds * 45;
    }

    public override draw(runtime: SceneRenderRuntime): void {
        this.root.render(runtime);
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
        height: 600,
        clearColor: Color.cornflowerBlue,
    });

    await app.start(new HelloScene());
}

void main();
