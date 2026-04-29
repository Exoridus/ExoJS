import { Application, Color, Scene, View, Sprite, Text, Input, Keyboard, Texture } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(new class extends Scene {

    async load(loader) {
        await loader.load(Texture, { example: 'image/uv.png' });
    }
    init(loader) {
        const { width, height } = this.app.canvas;

        this._moveSpeed = 3;
        this._zoomSpeed = 0.01;
        this._rotationSpeed = 1;

        this._camera = new View(0, 0, width, height);

        this._sprite = new Sprite(loader.get(Texture, 'example'));
        this._sprite.setAnchor(0.5, 0.5);

        this._info = new Text([
            'Camera:',
            'W/A/S/D = Move',
            'Up/Down = Zoom',
            'Left/Right = Rotate',
            'R = Reset',
        ].join('\n'), {
            fontSize: 16,
            fill: '#fff',
            padding: 10,
        });

        this.app.inputManager.add([

            // Move Up
            new Input(Keyboard.W, {
                onActive: value => this._camera.move(0, value * -this._moveSpeed),
            }),

            // Move Down
            new Input(Keyboard.S, {
                onActive: value => this._camera.move(0, value * this._moveSpeed),
            }),

            // Move Left
            new Input(Keyboard.A, {
                onActive: value => this._camera.move(value * -this._moveSpeed, 0),
            }),

            // Move Right
            new Input(Keyboard.D, {
                onActive: value => this._camera.move(value * this._moveSpeed, 0),
            }),

            // Zoom In
            new Input(Keyboard.Up, {
                onActive: value => this._camera.zoom(1 + (value * -this._zoomSpeed)),
            }),

            // Zoom Out
            new Input(Keyboard.Down, {
                onActive: value => this._camera.zoom(1 + (value * this._zoomSpeed)),
            }),

            // Rotate Left
            new Input(Keyboard.Left, {
                onActive: value => this._camera.rotate(value * -this._rotationSpeed),
            }),

            // Rotate Right
            new Input(Keyboard.Right, {
                onActive: value => this._camera.rotate(value * this._rotationSpeed),
            }),

            // Reset
            new Input(Keyboard.R, {
                onTrigger: () => this._camera.reset(0, 0, width, height),
            })
        ]);
    }
    draw(backend) {
        backend.clear();

        backend.setView(this._camera);
        this._sprite.render(backend);

        backend.setView(null);
        this._info.render(backend);
    }
});
