// Auto-generated from pivot-and-anchor.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Graphics, Scene, Sprite, Text } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';
const modes = [
  { name: 'corner', anchor: [0, 0], origin: [0, 0] },
  { name: 'center', anchor: [0.5, 0.5], origin: null },
  { name: 'off-canvas', anchor: [0.5, 0.5], origin: [180, -80] },
];
class PivotAndAnchorScene extends Scene {
  sprite;
  pivotMarker;
  label;
  hud;
  panel;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.sprite = new Sprite(this.loader.get('image/ship-a.png')).setPosition(width / 2, height / 2);
    this.pivotMarker = new Graphics();
    this.label = new Text('', { fillColor: Color.white, fontSize: 18 });
    this.label.setPosition(20, 20);
    this.hud = mountControls({ title: 'Pivot and Anchor', controls: [{ keys: 'Preset', action: 'compare rotation around each origin' }] });
    this.panel = mountControlPanel({ title: 'Origin presets' });
    modes.forEach((mode, index) => this.panel.addButton({ label: mode.name, onClick: () => this.applyMode(index) }));
    this.applyMode(0);
  }
  applyMode(index) {
    const mode = modes[index];
    this.sprite.setAnchor(mode.anchor[0], mode.anchor[1]);
    const bounds = this.sprite.getLocalBounds();
    this.sprite.setOrigin(mode.origin?.[0] ?? bounds.width * mode.anchor[0], mode.origin?.[1] ?? bounds.height * mode.anchor[1]);
    this.hud.setStatus(`${mode.name}: anchor (${mode.anchor.join(', ')}), origin (${this.sprite.origin.x.toFixed(0)}, ${this.sprite.origin.y.toFixed(0)})`);
  }
  update(delta) {
    this.sprite.rotate(delta * 45);
  }
  draw(context) {
    const m = this.sprite.getGlobalTransform();
    const bounds = this.sprite.getBounds();
    context.render(this.sprite);
    this.pivotMarker.clear();
    this.pivotMarker.lineColor = new Color(110, 215, 245);
    this.pivotMarker.lineWidth = 2;
    this.pivotMarker.drawLine(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y);
    this.pivotMarker.drawLine(bounds.x + bounds.width, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height);
    this.pivotMarker.drawLine(bounds.x + bounds.width, bounds.y + bounds.height, bounds.x, bounds.y + bounds.height);
    this.pivotMarker.drawLine(bounds.x, bounds.y + bounds.height, bounds.x, bounds.y);
    this.pivotMarker.fillColor = new Color(255, 80, 80);
    this.pivotMarker.drawCircle(m.x, m.y, 6);
    this.label.text = `position (${this.sprite.x.toFixed(0)}, ${this.sprite.y.toFixed(0)})  bounds (${bounds.x.toFixed(0)}, ${bounds.y.toFixed(0)}, ${bounds.width.toFixed(0)}, ${bounds.height.toFixed(0)})`;
    context.render(this.pivotMarker);
    context.render(this.label);
  }
  destroy() {
    this.panel?.dispose();
    this.hud?.dispose();
    this.sprite?.destroy();
    this.pivotMarker?.destroy();
    this.label?.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { PivotAndAnchorScene },
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
await app.start(PivotAndAnchorScene);
