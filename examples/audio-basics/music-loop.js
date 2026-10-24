// Auto-generated from music-loop.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Scene, Text } from '@codexo/exojs';
import { demoPanel } from '@examples/runtime';
class MusicLoopScene extends Scene {
  label = this.track(
    new Text('Track A: M1 unavailable\nTrack B: M2 unavailable\n\nTransport and crossfade need the approved music pair.', {
      fillColor: new Color(236, 239, 242),
      align: 'center',
    }),
  ).setAnchor(0.5);
  panel;
  init() {
    this.panel = demoPanel({
      layout: 'bar',
      title: 'Music Playback and Crossfade',
      controls: {},
      hint: 'The approved M1 / M2 music pair is not bundled yet.',
    });
    this.panel.status('BLOCKED: M1 and M2 missing | No source loaded | Audio stopped', 'warning');
  }
  draw(context) {
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas);
    this.label.style.fontSize = 16 * scale;
    this.label.layout = { maxWidth: (width - 32) * scale };
    this.label.setPosition((width * scale) / 2, (contentHeight * scale) / 2);
    context.render(this.label);
  }
  destroy() {
    this.panel?.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { MusicLoopScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(11, 16, 20),
});
await app.start(MusicLoopScene);
