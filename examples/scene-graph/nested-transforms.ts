import { Application, Color, Container, Graphics, type RenderingContext, Scene, type Time } from '@codexo/exojs';

const app = new Application({
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

class NestedTransformsScene extends Scene {
    private sun!: Graphics;
    private planetOrbit!: Container;
    private planet!: Graphics;
    private moonOrbit!: Container;
    private moon!: Graphics;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.sun = new Graphics();
        this.sun.fillColor = new Color(255, 220, 90);
        this.sun.drawCircle(0, 0, 30);

        this.planetOrbit = new Container().setPosition(width / 2, height / 2);
        this.planet = new Graphics();
        this.planet.fillColor = new Color(120, 190, 255);
        this.planet.drawCircle(0, 0, 16);
        this.planet.setPosition(220, 0);

        this.moonOrbit = new Container().setPosition(220, 0);
        this.moon = new Graphics();
        this.moon.fillColor = new Color(220, 220, 220);
        this.moon.drawCircle(0, 0, 8);
        this.moon.setPosition(44, 0);

        this.planetOrbit.addChild(this.sun);
        this.planetOrbit.addChild(this.planet);
        this.planetOrbit.addChild(this.moonOrbit);
        this.moonOrbit.addChild(this.moon);
    }

    override update(delta: Time): void {
        this.planetOrbit.rotate(delta.seconds * 30);
        this.planet.rotate(delta.seconds * 120);
        this.moonOrbit.rotate(delta.seconds * 180);
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.planetOrbit);
    }
}

app.start(new NestedTransformsScene());
