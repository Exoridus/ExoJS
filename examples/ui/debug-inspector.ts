import {
  Application,
  bindProperty,
  Color,
  FixedResolutionCanvasSizing,
  Label,
  live,
  Panel,
  Scene,
  type Seconds,
  Sprite,
  Stack,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { startExample } from '@examples/runtime';

// #region guide:debug-inspector
class DebugInspectorScene extends Scene {
  private readonly ship = new Sprite(assets.ship.source);
  private elapsed = 0;

  override init(): void {
    const { width, height } = this.app;
    const { ship } = this;
    const inspector = new Panel({ width: 440, height: 140 });
    const rows = new Stack({ spacing: 8 });
    const raw = new Label('', { fontSize: 15 });
    const position = new Label('', { fontSize: 15 });
    const scale = new Label('', { fontSize: 15 });
    // A template without observables is an ordinary string: a snapshot.
    const size = new Label(live`canvas: ${width} × ${height}`, { fontSize: 15 });

    ship.setAnchor(0.5).setPosition(width / 2, height / 2);

    // live text follows the vectors without per-frame code. The default string
    // form is exact; map() formats for display.
    bindProperty(raw, 'text', live`position: ${ship.position}`);
    bindProperty(
      position,
      'text',
      ship.position.map(p => `x ${p.x.toFixed(1)} | y ${p.y.toFixed(1)}`),
    );
    bindProperty(
      scale,
      'text',
      ship.scale.map(s => `scale ${s.x.toFixed(2)}`),
    );

    rows.addItem(raw);
    rows.addItem(position);
    rows.addItem(scale);
    rows.addItem(size);
    rows.setPosition(16, 16);
    inspector.addChild(rows);
    inspector.setPosition(24, 24);

    this.root.addChild(ship);
    this.ui.addChild(inspector);
  }

  override update(delta: Seconds): void {
    this.elapsed += delta;

    const { width, height } = this.app;

    this.ship.position.set(width / 2 + Math.cos(this.elapsed) * 260, height / 2 + Math.sin(this.elapsed * 2) * 140);
    this.ship.scale.set(1.5 + Math.sin(this.elapsed * 3) * 0.5);
  }
}
// #endregion guide:debug-inspector

const app = new Application({
  scenes: { DebugInspectorScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(10, 14, 22),
});

await startExample(app, () => app.start(DebugInspectorScene));
