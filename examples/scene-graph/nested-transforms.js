// Auto-generated from nested-transforms.ts - edit the .ts source, not this file.
import { Application, Color, Container, FixedResolutionCanvasSizing, Graphics, Keyboard, Scene, Text } from '@codexo/exojs';
import { demoPanel, startExample } from '@examples/runtime';
class NestedTransformsScene extends Scene {
  planetOrbit = new Container();
  moonOrbit = new Container().setPosition(110, 0);
  planet = new Graphics().setPosition(110, 0);
  moon = new Graphics().setPosition(38, 0);
  localLabels = [
    new Text('', { fillColor: new Color(255, 198, 104), fontSize: 14 }),
    new Text('', { fillColor: new Color(255, 198, 104), fontSize: 14 }),
  ];
  worldLabels = [
    new Text('', { fillColor: new Color(112, 224, 240), fontSize: 14 }),
    new Text('', { fillColor: new Color(112, 224, 240), fontSize: 14 }),
  ];
  panel;
  playing = true;
  elapsed = 0;
  init() {
    const sun = new Graphics();
    sun.fillColor = new Color(255, 220, 90);
    sun.drawCircle(0, 0, 22);
    const path = new Graphics();
    path.fillColor = Color.transparent;
    path.lineColor = new Color(86, 119, 140);
    path.lineWidth = 2;
    path.drawCircle(0, 0, 110);
    const moonPath = new Graphics();
    moonPath.fillColor = Color.transparent;
    moonPath.lineColor = new Color(86, 119, 140);
    moonPath.lineWidth = 2;
    moonPath.drawCircle(0, 0, 38);
    this.planet.fillColor = new Color(120, 190, 255);
    this.planet.drawCircle(0, 0, 12);
    this.moon.fillColor = new Color(230, 230, 230);
    this.moon.drawCircle(0, 0, 7);
    this.planetOrbit.addChild(path, sun, this.planet, this.moonOrbit);
    this.moonOrbit.addChild(moonPath, this.moon);
    this.root.addChild(this.planetOrbit, ...this.localLabels, ...this.worldLabels);
    this.panel = demoPanel({
      title: 'Parent and World Transforms',
      layout: 'bar',
      controls: {},
      hint: 'Click / Space pauses. Parent +15 degrees changes world positions, keeping local offsets.',
      actions: {
        'Pause / Resume': () => {
          this.playing = !this.playing;
        },
        'Parent +15°': () => {
          this.playing = false;
          this.planetOrbit.rotate(15);
        },
        Reset: () => this.reset(),
      },
    });
    this.inputs.onTrigger(Keyboard.Space, () => {
      this.playing = !this.playing;
    });
    this.inputs.onTrigger(Keyboard.R, () => this.reset());
    this.app.input.onPointerTap.add(this.onTap);
  }
  onTap = () => {
    this.playing = !this.playing;
  };
  reset() {
    this.elapsed = 0;
    this.planetOrbit.rotation = 0;
    this.moonOrbit.rotation = 0;
  }
  update(delta) {
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas);
    this.root.setScale(scale);
    const orbitScale = Math.min(1, (contentHeight - 32) / 296);
    this.planetOrbit.setPosition(width / 2, contentHeight / 2).setScale(orbitScale);
    this.planetOrbit.children[0].lineWidth = 2 / orbitScale;
    this.moonOrbit.children[0].lineWidth = 2 / orbitScale;
    if (this.playing) {
      this.elapsed += delta;
      this.planetOrbit.rotate(delta * 25);
      this.moonOrbit.rotate(delta * 100);
    }
    for (const [index, node] of [this.planet, this.moon].entries()) {
      const world = node.getWorldTransform();
      const x = world.x / scale;
      const y = world.y / scale;
      const labelX = Math.min(width - 174, Math.max(8, x + 15));
      const labelY = Math.min(contentHeight - 36, Math.max(4, y + (index === 0 ? -42 : 18)));
      this.localLabels[index].text = `${index === 0 ? 'Planet' : 'Moon'} local (${node.x}, ${node.y})`;
      this.localLabels[index].setPosition(labelX, labelY);
      this.worldLabels[index].text = `world (${world.x.toFixed(0)}, ${world.y.toFixed(0)})`;
      this.worldLabels[index].setPosition(labelX, labelY + 17);
    }
    this.panel.status(`${this.playing ? 'Running' : 'Paused'} | amber: local offset | cyan: world position`);
  }
  draw(context) {
    context.render(this.root);
  }
  destroy() {
    this.app.input.onPointerTap.remove(this.onTap);
    this.panel.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { NestedTransformsScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(20, 27, 34),
});
await startExample(app, () => app.start(NestedTransformsScene));
