import { Application, Color, Scene, Time, Sprite, Texture } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(new Scene({

    async load(loader) {
        await loader.load(Texture, { rainbow: 'image/rainbow.png' });
    },
    init(loader) {
        const { width, height } = this.app.canvas;

        this._time = new Time();

        this._boxA = new Sprite(loader.get(Texture, 'rainbow'));
        this._boxA.setPosition(width / 2, height / 2);
        this._boxA.setAnchor(0.5, 0.5);

        this._boxB = new Sprite(loader.get(Texture, 'rainbow'));
        this._boxB.setPosition(width / 2, height / 2);
        this._boxB.setAnchor(0.5, 0.5);

        this.app.inputManager.onPointerMove.add((pointer) => {
            this._boxB.setPosition(pointer.x, pointer.y);
        });
    },

    update(delta) {
        this._time.addTime(delta);

        this._boxA.setScale(0.25 + (Math.cos(this._time.seconds) * 0.5 + 0.5));
        this._boxB.setScale(0.25 + (Math.sin(this._time.seconds - Math.PI / 2) * 0.5 + 0.5));

        this._boxA.setRotation(this._time.seconds * 25);
        this._boxB.setRotation(this._time.seconds * -100);

        this._boxA.setTint(Color.white);
        this._boxB.setTint(Color.white);

        if (this._boxA.intersectsWith(this._boxB)) {
            const collision = this._boxA.collidesWith(this._boxB);

            if (!collision) {
                return;
            }

            const { shapeAinB, shapeBinA } = collision;

            this._boxA.setTint(shapeAinB ? Color.cyan : Color.red);
            this._boxB.setTint(shapeBinA ? Color.cyan : Color.red);
            this._boxB.tint.a = 0.5;
        }
    },

    draw(backend) {
        backend.clear();
        this._boxA.render(backend);
        this._boxB.render(backend);
    },
}));
