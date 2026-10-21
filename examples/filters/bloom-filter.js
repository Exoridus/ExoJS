// Auto-generated from bloom-filter.ts - edit the .ts source, not this file.
import { Application, BloomFilter, Color, Container, FixedResolutionCanvasSizing, Graphics, Scene } from '@codexo/exojs';
import { demoPanel, slider } from '@examples/runtime';
/**
 * Six discs of rising luminance on a dark backdrop. Only the ones above the
 * threshold glow, so dragging Threshold walks the glow along the row and shows
 * what the filter is actually selecting on.
 *
 * The threshold is measured on linear luminance, where 1 is display white, not
 * on the encoded value the Colors below are written in: an encoded channel value
 * of 128 is only about 0.22 in linear light. This scene runs on the
 * default 8-bit SDR working target, where nothing can exceed 1; an application
 * that opts into `rendering.color.workingFormat: 'hdr'` can bloom values above 1
 * with a threshold above 1.
 */
const DISCS = [
  new Color(40, 46, 70),
  new Color(70, 90, 140),
  new Color(110, 150, 210),
  new Color(160, 210, 255),
  new Color(225, 245, 255),
  new Color(255, 255, 255),
];
const DISC_RADIUS = 48;
class BloomFilterScene extends Scene {
  bloom;
  stage;
  discs;
  beam;
  elapsed = 0;
  init() {
    const { width, height } = this.app;
    this.bloom = new BloomFilter({ threshold: 0.6, intensity: 1.6, strength: 10, levels: 3 });
    this.discs = new Graphics();
    this.beam = new Graphics();
    // One filter over the whole stage rather than one per shape: bloom reads
    // the composed image, so a highlight next to another highlight glows as one
    // light rather than as two that happen to overlap.
    this.stage = new Container();
    this.stage.addChild(this.discs);
    this.stage.addChild(this.beam);
    this.stage.filters = [this.bloom];
    const spacing = width / (DISCS.length + 1);
    for (let index = 0; index < DISCS.length; index++) {
      this.discs.fillColor = DISCS[index];
      this.discs.drawCircle(spacing * (index + 1), height * 0.38, DISC_RADIUS);
    }
    demoPanel({
      title: 'Bloom',
      controls: {
        threshold: slider('Threshold', { min: 0, max: 1, step: 0.05, value: this.bloom.threshold }),
        intensity: slider('Intensity', { min: 0, max: 4, step: 0.1, value: this.bloom.intensity }),
        strength: slider('Strength', { min: 0, max: 32, step: 1, value: this.bloom.strength, format: v => v.toFixed(0) }),
        levels: slider('Levels', { min: 1, max: 5, step: 1, value: this.bloom.levels, format: v => v.toFixed(0) }),
      },
      onChange: (key, value) => {
        this.bloom[key] = value;
      },
    });
  }
  update(delta) {
    this.elapsed += delta;
  }
  draw(context) {
    const { width, height } = this.app;
    // A sweeping white bar: a moving highlight shows the glow tracking it,
    // which a still image cannot.
    const x = width * (0.5 + 0.42 * Math.sin(this.elapsed * 0.7));
    this.beam.clear();
    this.beam.fillColor = Color.white;
    this.beam.drawRoundedRectangle(x - 14, height * 0.62, 28, height * 0.24, 14);
    context.render(this.stage);
  }
}
const app = new Application({
  scenes: { BloomFilterScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(10, 12, 20),
});
await app.start(BloomFilterScene);
