import { Application, Color, Container, Graphics, Scene } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(
    new (class extends Scene {
        init() {
            this._sun = new Graphics();
            this._sun.fillColor = new Color(255, 220, 90);
            this._sun.drawCircle(0, 0, 30);

            this._planetOrbit = new Container().setPosition(400, 300);
            this._planet = new Graphics();
            this._planet.fillColor = new Color(120, 190, 255);
            this._planet.drawCircle(0, 0, 16);
            this._planet.setPosition(160, 0);

            this._moonOrbit = new Container().setPosition(160, 0);
            this._moon = new Graphics();
            this._moon.fillColor = new Color(220, 220, 220);
            this._moon.drawCircle(0, 0, 8);
            this._moon.setPosition(44, 0);

            this._planetOrbit.addChild(this._sun);
            this._planetOrbit.addChild(this._planet);
            this._planetOrbit.addChild(this._moonOrbit);
            this._moonOrbit.addChild(this._moon);
        }
        update(delta) {
            this._planetOrbit.rotate(delta.seconds * 30);
            this._planet.rotate(delta.seconds * 120);
            this._moonOrbit.rotate(delta.seconds * 180);
        }
        draw(backend) {
            backend.clear();
            this._planetOrbit.render(backend);
        }
    })()
);
