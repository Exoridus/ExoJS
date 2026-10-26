// Auto-generated from typographic-styling.ts - edit the .ts source, not this file.
import {
  ActionMap,
  Application,
  Asset,
  ButtonAction,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  Scene,
  Text,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { choice, demoPanel, startExample } from '@examples/runtime';
const paragraph =
  'AnUnbrokenTokenRevealsHowWordBreakingWorks. ' +
  'ExoJS lays out real text as you move the wrap edge. Font, width and word boundaries change the rhythm of a page. ' +
  'Compare words with break words, then try a display font. ' +
  'Grüße, Straße, € and an en dash – belong to the sample; a font can fall back for individual glyphs.';
const controls = {
  font: choice('Font', ['System', 'Space Grotesk', 'Kenney Future', 'Missing file'], 'Space Grotesk'),
  wrap: choice('Wrap', ['Words', 'Break words', 'No wrap']),
  heading: choice('Heading', ['Plain', 'Outline', 'Shadow', 'Gradient']),
};
class TextLayoutScene extends Scene {
  panel;
  title = this.track(new Text('Plain', { fillColor: new Color(37, 49, 43) }));
  body = this.track(new Text(paragraph, { fillColor: new Color(37, 49, 43), lineHeight: 1.5 }));
  guide = this.track(new Graphics());
  handle = document.createElement('button');
  actions = new ActionMap({
    narrower: new ButtonAction(Keyboard.Left),
    wider: new ButtonAction(Keyboard.Right),
  });
  width = 620;
  scale = 0;
  dirty = true;
  fontStatus = 'Space Grotesk loaded';
  fontRequest = 0;
  disposed = false;
  async load() {
    await this.loader.load(assets.fontKenneyFuture);
  }
  init() {
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls,
      onChange: (key, _value, values) => {
        this.dirty = true;
        if (key === 'font') {
          void this.selectFont(values.font);
        }
      },
    });
    this.handle.type = 'button';
    this.handle.textContent = '↔';
    this.handle.setAttribute('role', 'slider');
    this.handle.setAttribute('aria-label', 'Wrap width');
    this.handle.setAttribute('aria-valuemin', '160');
    Object.assign(this.handle.style, {
      position: 'fixed',
      width: '32px',
      height: '32px',
      padding: '0',
      zIndex: '2',
      background: '#88e97e',
      color: '#233f3b',
      border: '2px solid #23643c',
      borderRadius: '4px',
      cursor: 'ew-resize',
      touchAction: 'none',
      transformOrigin: 'top left',
      font: '18px system-ui',
    });
    this.handle.addEventListener('pointerdown', event => this.handle.setPointerCapture(event.pointerId));
    this.handle.addEventListener('pointermove', event => {
      if (this.handle.hasPointerCapture(event.pointerId)) {
        const canvas = this.app.canvas;
        const box = canvas.getBoundingClientRect();
        const sceneX = ((event.clientX - box.left) * this.app.width) / box.width;
        this.width = sceneX / this.scale - 24;
        this.dirty = true;
      }
    });
    this.handle.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        this.width += event.key === 'ArrowLeft' ? -20 : 20;
        this.dirty = true;
      }
    });
    document.body.append(this.handle);
    this.inputs.attach(this.actions);
  }
  async selectFont(font) {
    const request = ++this.fontRequest;
    if (font === 'Space Grotesk') {
      this.fontStatus = 'Loading Space Grotesk...';
      try {
        await document.fonts.load('18px "Space Grotesk"');
      } catch {
        // The sample remains usable with the browser's fallback when the site font cannot load.
      }
    }
    if (this.disposed || request !== this.fontRequest) {
      return;
    }
    if (font === 'Missing file') {
      this.fontStatus = 'Loading missing font file...';
      try {
        await this.loader.load(Asset.type('font', `${assets.fontKenneyFuture.source}.missing`, { family: 'Missing Example Font' }));
        this.fontStatus = 'Unexpectedly loaded missing file';
      } catch {
        if (this.disposed || request !== this.fontRequest) {
          return;
        }
        this.fontStatus = 'File failed | fallback shown';
      }
    } else {
      const loaded = [...document.fonts].some(face => face.family.replace(/^['"]|['"]$/g, '') === font && face.status === 'loaded');
      this.fontStatus = font === 'System' ? 'System font' : loaded ? `${font} loaded` : `${font} unavailable | fallback shown`;
    }
    if (this.disposed || request !== this.fontRequest) {
      return;
    }
    const family = font === 'System' ? 'sans-serif' : font === 'Missing file' ? 'Missing Example Font' : font;
    this.title.style.fontFamily = family;
    this.body.style.fontFamily = family;
    this.dirty = true;
  }
  update() {
    if (this.actions.narrower.pressed) {
      this.width -= 20;
      this.dirty = true;
    }
    if (this.actions.wider.pressed) {
      this.width += 20;
      this.dirty = true;
    }
    const { scale: k, width, height } = this.panel.fit(this.app, this.app.canvas);
    if (k !== this.scale) {
      this.scale = k;
      this.dirty = true;
    }
    if (!this.dirty) {
      return;
    }
    this.dirty = false;
    const panel = this.panel.element;
    this.width = Math.min(width - 64, Math.max(160, this.width));
    const { wrap, heading } = this.panel.values;
    this.title.text = heading;
    this.title.style.fontSize = 32 * k;
    this.title.style.outlineWidth = heading === 'Outline' ? 0.12 : 0;
    this.title.style.outlineColor = new Color(35, 100, 60);
    this.title.style.shadowAlpha = heading === 'Shadow' ? 0.5 : 0;
    this.title.style.shadowOffsetX = 3 * k;
    this.title.style.shadowOffsetY = 3 * k;
    this.title.style.gradient =
      heading === 'Gradient'
        ? {
            stops: [
              { offset: 0, color: new Color(35, 100, 60) },
              { offset: 1, color: new Color(35, 110, 140) },
            ],
            angle: 90,
          }
        : null;
    this.title.setPosition(24 * k, 20 * k);
    this.body.style.fontSize = 18 * k;
    this.body.setPosition(24 * k, 76 * k);
    const layout = { maxWidth: wrap === 'No wrap' ? undefined : this.width * k, breakWords: wrap === 'Break words' };
    // Measure the unrestricted layout first so the readout reports omitted lines as well.
    this.body.layout = layout;
    const lineHeight = this.body.style.fontSize * this.body.style.lineHeight + this.body.style.leading;
    const total = Math.round(this.body.textBounds.height / lineHeight);
    this.panel.status(`${this.fontStatus} | ${Math.round(this.width)} px | ${total} lines`);
    const maxHeight = Math.max(27, height - panel.uiHeight - 94) * k;
    this.body.layout = { ...layout, maxHeight, overflow: 'ellipsis' };
    const shown = Math.round(this.body.textBounds.height / lineHeight);
    this.panel.status(
      `${this.fontStatus} | ${Math.round(this.width)} px | ${shown} of ${total} lines${wrap === 'No wrap' ? ' | No wrap: intentional overflow' : ''}`,
      this.panel.values.font === 'Missing file' ? 'warning' : 'neutral',
    );
    this.guide.clear();
    this.guide.lineColor = new Color(35, 100, 60);
    this.guide.lineWidth = 2 * k;
    this.guide.moveTo((24 + this.width) * k, 65 * k).lineTo((24 + this.width) * k, (height - panel.uiHeight - 12) * k);
    this.handle.style.left = `${(8 + this.width) * k}px`;
    this.handle.style.top = `${38 * k}px`;
    this.handle.style.transform = `scale(${k})`;
    this.handle.setAttribute('aria-valuemax', String(Math.round(width - 64)));
    this.handle.setAttribute('aria-valuenow', String(Math.round(this.width)));
  }
  draw(context) {
    context.render(this.guide);
    context.render(this.title);
    context.render(this.body);
  }
  destroy() {
    this.disposed = true;
    this.fontRequest++;
    this.handle.remove();
    this.panel?.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { TextLayoutScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(247, 244, 235),
});
await startExample(app, () => app.start(TextLayoutScene));
