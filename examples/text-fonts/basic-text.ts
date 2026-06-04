import { Application, Color, FontAsset, Scene, Text, Time } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

document.body.append(app.canvas);

class BasicTextScene extends Scene {
    private _time!: Time;
    private _text!: Text;

    override async load(loader): Promise<void> {
        await loader.load(FontAsset, { example: 'font/Kenney Future.ttf' }, { family: 'Kenney Future' });
    }

    override init(): void {
        const { width, height } = this.app.canvas;

        this._time = new Time();

        this._text = new Text('Hello World!', {
            align: 'left',
            fillColor: Color.white,
            outlineColor: Color.black,
            outlineWidth: 0.2,
            fontSize: 25,
            fontFamily: 'Kenney Future',
        });

        this._text.setPosition(width / 2, height / 2);
        this._text.setAnchor(0.5, 0.5);
    }

    override update(delta): void {
        this._text.text = `Hello World! ${this._time.addTime(delta).seconds | 0}`;
        this._text.rotate(delta.seconds * 36);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._text);
    }
}

app.start(new BasicTextScene());
