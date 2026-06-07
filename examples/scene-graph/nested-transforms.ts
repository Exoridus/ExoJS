import { Application, Color, Container, Graphics, Scene } from '@codexo/exojs';

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

class NestedTransformsScene extends Scene {
    private sun!: Graphics;
    private planetOrbit!: Container;
    private planet!: Graphics;
    private moonOrbit!: Container;
    private moon!: Graphics;

    override init(): void {
        this.sun = new Graphics();
        this.sun.fillColor = new Color(255, 220, 90);
        this.sun.drawCircle(0, 0, 30);

        this.planetOrbit = new Container().setPosition(400, 300);
        this.planet = new Graphics();
        this.planet.fillColor = new Color(120, 190, 255);
        this.planet.drawCircle(0, 0, 16);
        this.planet.setPosition(160, 0);

        this.moonOrbit = new Container().setPosition(160, 0);
        this.moon = new Graphics();
        this.moon.fillColor = new Color(220, 220, 220);
        this.moon.drawCircle(0, 0, 8);
        this.moon.setPosition(44, 0);

        this.planetOrbit.addChild(this.sun);
        this.planetOrbit.addChild(this.planet);
        this.planetOrbit.addChild(this.moonOrbit);
        this.moonOrbit.addChild(this.moon);
    }

    override update(delta): void {
        this.planetOrbit.rotate(delta.seconds * 30);
        this.planet.rotate(delta.seconds * 120);
        this.moonOrbit.rotate(delta.seconds * 180);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.planetOrbit);
    }
}

app.start(new NestedTransformsScene());
