import { Application, Color, Scene, Sprite, Texture, Time } from '@codexo/exojs';

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

const collisionRed = new Color(255, 0, 0);

class RectanglesCollisionScene extends Scene {
    private time!: Time;
    private boxA!: Sprite;
    private boxB!: Sprite;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { gradient: 'image/hue-ramp.png' });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.time = new Time();

        this.boxA = new Sprite(loader.get(Texture, 'gradient'));
        this.boxA.setPosition(width / 2, height / 2);
        this.boxA.setAnchor(0.5, 0.5);

        this.boxB = new Sprite(loader.get(Texture, 'gradient'));
        this.boxB.setPosition(width / 2, height / 2);
        this.boxB.setAnchor(0.5, 0.5);

        this.app.input.onPointerMove.add(pointer => {
            this.boxB.setPosition(pointer.x, pointer.y);
        });
    }

    override update(delta): void {
        this.time.addTime(delta);

        this.boxA.setScale(0.25 + (Math.cos(this.time.seconds) * 0.5 + 0.5));
        this.boxB.setScale(0.25 + (Math.sin(this.time.seconds - Math.PI / 2) * 0.5 + 0.5));

        this.boxA.setRotation(this.time.seconds * 25);
        this.boxB.setRotation(this.time.seconds * -100);

        this.boxA.setTint(Color.white);
        this.boxB.setTint(Color.white);

        if (this.boxA.intersectsWith(this.boxB)) {
            const collision = this.boxA.collidesWith(this.boxB);

            if (!collision) {
                return;
            }

            const { shapeAinB, shapeBinA } = collision;

            this.boxA.setTint(shapeAinB ? Color.cyan : collisionRed);
            this.boxB.setTint(shapeBinA ? Color.cyan : collisionRed);
            this.boxB.tint.a = 0.5;
        }
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.boxA);
        context.render(this.boxB);
    }
}

app.start(new RectanglesCollisionScene());
