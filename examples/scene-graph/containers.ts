import { Application, Color, Container, Scene, Sprite, Texture } from '@codexo/exojs';

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

class ContainersScene extends Scene {
    private _rainbow!: Sprite;
    private _bunnies!: Container;

    override async load(loader): Promise<void> {
        await loader.load(Texture, {
            bunny: 'image/ship-a.png',
            rainbow: 'image/hue-ramp.png',
        });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this._rainbow = new Sprite(loader.get(Texture, 'rainbow'));

        this._bunnies = new Container();
        this._bunnies.setPosition((width / 2) | 0, (height / 2) | 0);

        for (let i = 0; i < 25; i++) {
            const bunny = new Sprite(loader.get(Texture, 'bunny'));

            bunny.setPosition((i % 5) * (bunny.width + 15), ((i / 5) | 0) * (bunny.height + 10));

            this._bunnies.addChild(bunny);
        }

        this._bunnies.setAnchor(0.5);
    }

    override update(delta): void {
        const bounds = this._bunnies.getBounds();

        this._rainbow.x = bounds.x;
        this._rainbow.y = bounds.y;
        this._rainbow.width = bounds.width;
        this._rainbow.height = bounds.height;

        this._bunnies.rotate(delta.seconds * 36);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._rainbow);
        context.render(this._bunnies);
    }
}

app.start(new ContainersScene());
