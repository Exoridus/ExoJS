import { Application, Asset, Color, type RenderingContext, Scene, Text, Time } from '@codexo/exojs';



class BasicTextScene extends Scene {
    private time!: Time;
    private text!: Text;

    override async init(): Promise<void> {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        await this.loader.load(Asset.kind('font', 'font/Kenney Future.ttf', { family: 'Kenney Future' }));

        const { width, height } = app.canvas;

        this.time = new Time();

        this.text = new Text('Hello World!', {
            align: 'left',
            fillColor: Color.white,
            outlineColor: Color.black,
            outlineWidth: 0.2,
            fontSize: 25,
            fontFamily: 'Kenney Future',
        });

        this.text.setPosition(width / 2, height / 2);
        this.text.setAnchor(0.5, 0.5);
    }

    override update(delta: Time): void {
        this.text.text = `Hello World! ${this.time.addTime(delta).seconds | 0}`;
        this.text.rotate(delta.seconds * 36);
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.text);
    }
}

const app = new Application({
    scenes: { BasicTextScene },
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

app.start(BasicTextScene);
