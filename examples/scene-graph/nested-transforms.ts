import { Application, Color, Container, Graphics, Keyboard, ResponsiveCanvasSizing, Scene, type Seconds, Text } from '@codexo/exojs';
import { demoPanel, startExample } from '@examples/runtime';

class NestedTransformsScene extends Scene {
  private readonly planetOrbit = new Container();
  private readonly moonOrbit = new Container().setPosition(110, 0);
  private readonly planet = new Graphics().setPosition(110, 0);
  private readonly moon = new Graphics().setPosition(38, 0);
  private readonly localLabels = [
    new Text('', { fillColor: new Color(255, 198, 104), fontSize: 14 }),
    new Text('', { fillColor: new Color(255, 198, 104), fontSize: 14 }),
  ];
  private readonly worldLabels = [
    new Text('', { fillColor: new Color(112, 224, 240), fontSize: 14 }),
    new Text('', { fillColor: new Color(112, 224, 240), fontSize: 14 }),
  ];
  private panel!: ReturnType<typeof demoPanel<Record<string, never>>>;
  private playing = true;
  private readonly dataBackground = new Graphics();

  override init(): void {
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
    this.root.addChild(this.planetOrbit, this.dataBackground, ...this.localLabels, ...this.worldLabels);
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls: {},
      actions: {
        'Pause / Resume': () => {
          this.playing = !this.playing;
        },
        'Parent +15°': () => {
          this.playing = false;
          this.planetOrbit.rotate(15);
        },
      },
    });
    this.inputs.onTrigger(Keyboard.Space, () => {
      this.playing = !this.playing;
    });
  }

  override update(delta: Seconds): void {
    // This layout uses top-left coordinates even as the host changes aspect.
    this.app.rendering.view.setCenter(this.app.width / 2, this.app.height / 2);
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.root.setScale(scale);
    const dataHeight = 70;
    const diagramHeight = Math.max(20, contentHeight - dataHeight);
    const orbitScale = Math.max(0.05, Math.min(1.8, (diagramHeight - 20) / 310, (width - 32) / 310));
    this.planetOrbit.setPosition(width / 2, diagramHeight / 2).setScale(orbitScale);
    this.dataBackground.clear();
    this.dataBackground.fillColor = new Color(28, 39, 50);
    this.dataBackground.drawRoundedRectangle(8, diagramHeight, width - 16, dataHeight - 4, 8);
    (this.planetOrbit.children[0] as Graphics).lineWidth = 2 / orbitScale;
    (this.moonOrbit.children[0] as Graphics).lineWidth = 2 / orbitScale;

    if (this.playing) {
      this.planetOrbit.rotate(delta * 25);
      this.moonOrbit.rotate(delta * 100);
    }

    for (const [index, node] of [this.planet, this.moon].entries()) {
      const world = node.getWorldTransform();
      const labelX = 18 + index * (width / 2);
      this.localLabels[index].text = `${index === 0 ? 'Planet' : 'Moon'} local (${node.x}, ${node.y})`;
      this.localLabels[index].setPosition(labelX, diagramHeight + 10);
      this.worldLabels[index].text = `World (${world.x.toFixed(0)}, ${world.y.toFixed(0)})`;
      this.worldLabels[index].setPosition(labelX, diagramHeight + 33);
    }

    this.panel.status(`${this.playing ? 'Running' : 'Paused'} | amber: local offset | cyan: world position`);
  }
}

const app = new Application({
  scenes: { NestedTransformsScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new ResponsiveCanvasSizing({ minAspect: 1 }) },
  clearColor: new Color(20, 27, 34),
});
await startExample(app, () => app.start(NestedTransformsScene));
