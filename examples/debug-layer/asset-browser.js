// Auto-generated from asset-browser.ts - edit the .ts source, not this file.
import {
  Application,
  BitmapText,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  Scene,
  Sprite,
  Spritesheet,
  Text,
  Texture,
} from '@codexo/exojs';
import { demoAssetCategories, demoAssets as assets } from '@codexo/exojs-demo-assets';
// Every standard demo asset, grouped by the catalog's own categories. The
// catalog is plain descriptors: nothing is fetched until an entry is selected,
// and each selection loads exactly the one descriptor it shows.
const KEYS = Object.keys(demoAssetCategories);
const CATEGORIES = [...new Set(KEYS.map(key => demoAssetCategories[key]))];
const keysIn = category => KEYS.filter(key => demoAssetCategories[key] === category);
// An atlas JSON and its image are separate descriptors named `<name>Atlas` and
// `<name>Image`; the browser shows them together.
const atlasPair = key => {
  const base = key.replace(/(Atlas|Image)$/, '');
  const image = `${base}Image`;
  const atlas = `${base}Atlas`;
  return image in assets && atlas in assets ? { image, atlas } : null;
};
const BACKDROPS = [new Color(45, 50, 65), new Color(255, 255, 255), new Color(0, 0, 0)];
const SIDEBAR = 300;
const PREVIEW = { x: SIDEBAR + 40, y: 40, width: 1280 - SIDEBAR - 80, height: 720 - 120 };
class AssetBrowserScene extends Scene {
  list = document.createElement('nav');
  category = document.createElement('select');
  entries = document.createElement('ul');
  info = document.createElement('p');
  items = new Map();
  selected = KEYS[0];
  listed = null;
  backdrop = 0;
  request = 0;
  drawables = [];
  caption;
  voice = null;
  video = null;
  init() {
    this.caption = new Text('', { fontSize: 15, fillColor: new Color(200, 214, 236) }).setPosition(PREVIEW.x, 720 - 56);
    this.mountSidebar();
    this.inputs.onTrigger(Keyboard.Down, () => this.move(1));
    this.inputs.onTrigger(Keyboard.Up, () => this.move(-1));
    this.inputs.onTrigger(Keyboard.B, () => (this.backdrop = (this.backdrop + 1) % BACKDROPS.length));
    this.inputs.onTrigger(Keyboard.Space, () => this.togglePlayback());
    void this.select(this.selected);
  }
  mountSidebar() {
    Object.assign(this.list.style, {
      position: 'fixed',
      inset: '0 auto 0 0',
      width: `${SIDEBAR}px`,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '14px',
      boxSizing: 'border-box',
      background: 'rgba(8, 12, 20, 0.92)',
      color: '#f3f7ff',
      font: '13px "Segoe UI", system-ui, sans-serif',
    });
    this.list.setAttribute('aria-label', 'Demo assets');
    this.category.setAttribute('aria-label', 'Category');
    this.category.append(...CATEGORIES.map(name => new Option(`${name} (${keysIn(name).length})`, name)));
    this.category.addEventListener('change', () => void this.select(keysIn(this.category.value)[0]));
    Object.assign(this.entries.style, { flex: '1 1 auto', overflowY: 'auto', listStyle: 'none', margin: '0', padding: '0' });
    Object.assign(this.info.style, { margin: '0', color: '#9fd0ff', wordBreak: 'break-all' });
    this.list.append(this.category, this.entries, this.info);
    document.body.append(this.list);
  }
  renderList(category) {
    this.listed = category;
    this.category.value = category;
    this.items.clear();
    this.entries.replaceChildren(
      ...keysIn(category).map(key => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = key;
        Object.assign(button.style, {
          width: '100%',
          padding: '4px 8px',
          textAlign: 'left',
          border: '0',
          borderRadius: '6px',
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
        });
        button.addEventListener('click', () => void this.select(key));
        this.items.set(key, button);
        item.append(button);
        return item;
      }),
    );
  }
  move(delta) {
    const siblings = keysIn(demoAssetCategories[this.selected]);
    const index = siblings.indexOf(this.selected);
    void this.select(siblings[(index + delta + siblings.length) % siblings.length]);
  }
  async select(key) {
    const category = demoAssetCategories[key];
    if (this.listed !== category) {
      this.renderList(category);
    }
    this.selected = key;
    for (const [itemKey, button] of this.items) {
      button.style.background = itemKey === key ? 'rgba(127, 184, 255, 0.28)' : 'transparent';
      button.setAttribute('aria-current', String(itemKey === key));
    }
    this.items.get(key)?.scrollIntoView({ block: 'nearest' });
    const descriptor = assets[key];
    const request = ++this.request;
    this.stopPlayback();
    this.drawables = [];
    this.info.textContent = `${descriptor.type} - ${decodeURIComponent(descriptor.source.split('/media/')[1] ?? descriptor.source)}`;
    this.caption.text = 'Loading...';
    try {
      const preview = await this.preview(key);
      if (request === this.request) {
        this.drawables = preview.drawables;
        this.caption.text = preview.caption;
      }
    } catch (error) {
      if (request === this.request) {
        this.caption.text = `Failed to load: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  }
  async preview(key) {
    const pair = atlasPair(key);
    if (pair) {
      const [texture, data] = await Promise.all([this.loader.load(assets[pair.image]), this.loader.load(assets[pair.atlas])]);
      const sprite = this.fit(new Sprite(texture));
      const outlines = new Graphics();
      const frames = Object.values(new Spritesheet(texture, data).frames);
      const scale = sprite.scale.x;
      outlines.lineWidth = 1;
      outlines.lineColor = new Color(255, 214, 102, 0.8);
      for (const frame of frames) {
        outlines.drawRectangle(sprite.x + frame.x * scale, sprite.y + frame.y * scale, frame.width * scale, frame.height * scale);
      }
      return { drawables: [sprite, outlines], caption: `${texture.width} x ${texture.height} px, ${frames.length} frames` };
    }
    const descriptor = assets[key];
    switch (descriptor.type) {
      case 'texture': {
        const texture = await this.loader.load(descriptor);
        return { drawables: [this.fit(new Sprite(texture))], caption: `${texture.width} x ${texture.height} px` };
      }
      case 'svg': {
        const image = await this.loader.load(descriptor);
        return {
          drawables: [this.fit(new Sprite(new Texture(image)), 4)],
          caption: `${image.naturalWidth} x ${image.naturalHeight} px (SVG)`,
        };
      }
      case 'font': {
        const face = await this.loader.load(descriptor);
        const fontFamily = face.family.replaceAll('"', '');
        return {
          drawables: [
            new Text('AaBbCc 0123 !?', { fontFamily, fontSize: 64, fillColor: Color.white }).setPosition(PREVIEW.x, PREVIEW.y + 120),
            new Text('The quick brown fox jumps over the lazy dog', { fontFamily, fontSize: 26, fillColor: Color.white }).setPosition(
              PREVIEW.x,
              PREVIEW.y + 230,
            ),
          ],
          caption: `Font family "${fontFamily}"`,
        };
      }
      case 'bmFont': {
        const font = await this.loader.load(descriptor);
        return {
          drawables: [new BitmapText('BITMAP FONT 0123', font).setPosition(PREVIEW.x, PREVIEW.y + 160)],
          caption: 'Bitmap font (.fnt + page texture)',
        };
      }
      case 'sound': {
        const sound = await this.loader.load(descriptor);
        this.voice = this.app.audio.play(sound);
        return { drawables: [], caption: `Sound, ${sound.duration.toFixed(2)} s - Space plays it again` };
      }
      case 'music': {
        const stream = await this.loader.load(descriptor);
        this.voice = this.app.audio.play(stream, { volume: 0.5 });
        return { drawables: [], caption: 'Streamed music - Space pauses and resumes' };
      }
      case 'video': {
        const video = await this.loader.load(descriptor);
        this.video = video;
        video.applyOptions({ loop: true, muted: true });
        video.play();
        return { drawables: [this.fit(video)], caption: 'Video, muted - Space pauses and resumes' };
      }
      default: {
        const data = await this.loader.load(descriptor);
        const fields = data !== null && typeof data === 'object' ? Object.keys(data).slice(0, 12).join(', ') : typeof data;
        return {
          drawables: [
            new Text(`Top-level fields:\n${fields}`, { fontSize: 18, fillColor: Color.white, maxWidth: PREVIEW.width }).setPosition(
              PREVIEW.x,
              PREVIEW.y,
            ),
          ],
          caption: 'JSON document (map or project data)',
        };
      }
    }
  }
  /** Scales a drawable to fit the preview area, never above `maxScale`, and centres it. */
  fit(sprite, maxScale = 8) {
    const scale = Math.min(maxScale, PREVIEW.width / sprite.width, PREVIEW.height / sprite.height);
    sprite.setScale(scale);
    sprite.setPosition(PREVIEW.x + (PREVIEW.width - sprite.width) / 2, PREVIEW.y + (PREVIEW.height - sprite.height) / 2);
    return sprite;
  }
  togglePlayback() {
    if (this.video) {
      this.video.toggle();
    } else if (this.voice && !this.voice.ended) {
      if (this.voice.paused) {
        this.voice.resume();
      } else {
        this.voice.pause();
      }
    } else if (assets[this.selected].type === 'sound') {
      void this.select(this.selected);
    }
  }
  stopPlayback() {
    this.voice?.stop();
    this.voice = null;
    this.video?.pause();
    this.video = null;
  }
  draw(context) {
    context.clear(BACKDROPS[this.backdrop]);
    for (const drawable of this.drawables) {
      context.render(drawable);
    }
    context.render(this.caption);
  }
  destroy() {
    this.stopPlayback();
    this.list.remove();
    super.destroy();
  }
}
const app = new Application({
  scenes: { AssetBrowserScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: BACKDROPS[0],
});
await app.start(AssetBrowserScene);
