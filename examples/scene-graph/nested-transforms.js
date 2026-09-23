// Auto-generated from nested-transforms.ts - edit the .ts source, not this file.
import { Application, Color, Container, FixedResolutionCanvasSizing, Graphics, Scene, Text } from '@codexo/exojs';
class NestedTransformsScene extends Scene {
  sun;
  planetOrbit;
  planet;
  moonOrbit;
  moon;
  readout;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.sun = new Graphics();
    this.sun.fillColor = new Color(255, 220, 90);
    this.sun.drawCircle(0, 0, 30);
    this.planetOrbit = new Container().setPosition(width / 2, height / 2);
    const planetPath = new Graphics();
    planetPath.lineWidth = 2;
    planetPath.lineColor = new Color(60, 88, 122);
    planetPath.drawCircle(0, 0, 220);
    this.planet = new Graphics();
    this.planet.fillColor = new Color(120, 190, 255);
    this.planet.drawCircle(0, 0, 16);
    this.planet.setPosition(220, 0);
    this.moonOrbit = new Container().setPosition(220, 0);
    const moonPath = new Graphics();
    moonPath.lineWidth = 2;
    moonPath.lineColor = new Color(88, 98, 118);
    moonPath.drawCircle(0, 0, 44);
    this.moon = new Graphics();
    this.moon.fillColor = new Color(220, 220, 220);
    this.moon.drawCircle(0, 0, 8);
    this.moon.setPosition(44, 0);
    this.planetOrbit.addChild(planetPath);
    this.planetOrbit.addChild(this.sun);
    this.planetOrbit.addChild(this.planet);
    this.planetOrbit.addChild(this.moonOrbit);
    this.moonOrbit.addChild(moonPath);
    this.moonOrbit.addChild(this.moon);
    this.readout = new Text('', { fillColor: Color.white, fontSize: 17 });
    this.readout.setPosition(18, 18);
  }
  update(delta) {
    this.planetOrbit.rotate(delta * 30);
    this.moonOrbit.rotate(delta * 180);
    const planetWorld = this.planet.getWorldTransform();
    const moonWorld = this.moon.getWorldTransform();
    this.readout.text = `Planet local ${this.planet.x.toFixed(0)}, ${this.planet.y.toFixed(0)} | world ${planetWorld.x.toFixed(0)}, ${planetWorld.y.toFixed(0)}\nMoon local ${this.moon.x.toFixed(0)}, ${this.moon.y.toFixed(0)} | world ${moonWorld.x.toFixed(0)}, ${moonWorld.y.toFixed(0)}`;
  }
  draw(context) {
    context.render(this.planetOrbit);
    context.render(this.readout, { view: context.screenView });
  }
}
const app = new Application({
  scenes: { NestedTransformsScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  loader: {
    basePath: 'assets/',
  },
});
await app.start(NestedTransformsScene);
