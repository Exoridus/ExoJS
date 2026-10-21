// Auto-generated from svg-drawable.ts - edit the .ts source, not this file.
import { Application, Asset, Color, FixedResolutionCanvasSizing, Scene, Sprite, Texture } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
class SvgDrawableScene extends Scene {
  texture;
  sprite;
  async load() {
    const app = this.app;
    const { width, height } = app;
    // SvgAsset has no seamless adapter (unlike Texture/Sound), so it is
    // awaited via `load()` rather than fetched synchronously via `get()`.
    // The exo.js wordmark SVG carries only a viewBox (no width/height), so
    // it would rasterise to a 0x0 image. Request an explicit pixel size -
    // the SVG is vector, so it stays crisp at any rasterised resolution.
    //
    const mark = await this.loader.load(Asset.type('svg', assets.exoWordmark.source, { width: 850, height: 324 }));
    this.texture = new Texture(mark);
    this.sprite = new Sprite(this.texture);
    this.sprite.setAnchor(0.5);
    this.sprite.setPosition((width / 2) | 0, (height / 2) | 0);
  }
  draw(context) {
    context.render(this.sprite);
  }
}
const app = new Application({
  scenes: { SvgDrawableScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});
await app.start(SvgDrawableScene);
