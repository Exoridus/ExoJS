// Auto-generated from transition-gallery.ts - edit the .ts source, not this file.
import {
  Application,
  Button,
  Color,
  Container,
  CrossFadeSceneTransition,
  Dropdown,
  Ease,
  FadeSceneTransition,
  Graphics,
  Label,
  Panel,
  ResponsiveCanvasSizing,
  Scene,
  SlideSceneTransition,
  Time,
} from '@codexo/exojs';
import { GallerySceneTransition } from '@examples/gallery-transitions';
import { unitsPerCssPixel } from '@examples/runtime';
const transitions = [
  {
    label: 'Fade through black',
    detail: 'A color overlay closes, then opens.',
    transition: new FadeSceneTransition({ duration: Time.seconds(0.4) }),
  },
  {
    label: 'Crossfade',
    detail: 'The frozen frame blends into the live scene.',
    transition: new CrossFadeSceneTransition({ duration: Time.seconds(0.9) }),
  },
  {
    label: 'Slide / push',
    detail: 'Each scene slides through its own phase.',
    transition: new SlideSceneTransition({ direction: 'left', mode: 'push', duration: Time.seconds(0.4), easing: Ease.cubicInOut }),
  },
  {
    label: 'Slide / cover',
    detail: 'The new scene slides over the frozen frame.',
    transition: new SlideSceneTransition({ direction: 'left', mode: 'cover', duration: Time.seconds(0.4), easing: Ease.cubicInOut }),
  },
  {
    label: 'Slide / reveal',
    detail: 'The old scene slides away before the switch.',
    transition: new SlideSceneTransition({ direction: 'right', mode: 'reveal', duration: Time.seconds(0.4), easing: Ease.cubicInOut }),
  },
  { label: 'Mask / iris', detail: 'A circular mask shrinks the outgoing snapshot.', transition: new GallerySceneTransition('iris') },
  {
    label: 'Shader / dissolve',
    detail: 'A shader dissolves the frozen frame in tiles.',
    transition: new GallerySceneTransition('dissolve'),
  },
  {
    label: 'Snapshot / drift',
    detail: 'The old frame freezes, grows and drifts away.',
    transition: new GallerySceneTransition('snapshot'),
  },
];
let selected = 1;
let playing = false;
let failure = '';
class GalleryScene extends Scene {
  observatory = false;
  art = new Container();
  sky = new Graphics();
  movingLight = new Graphics();
  background = new Graphics();
  panel;
  selector;
  replay;
  previous;
  next;
  mode;
  detail;
  location;
  clock;
  time = 0;
  init() {
    const accent = this.observatory ? new Color(255, 195, 118) : new Color(123, 232, 210);
    this.background.fillColor = this.observatory ? new Color(30, 24, 49) : new Color(12, 35, 47);
    this.background.drawRectangle(0, 0, 1, 1);
    this.root.addChild(this.background, this.art);
    this.art.addChild(this.sky, this.movingLight);
    this.drawLandscape(accent);
    this.movingLight.fillColor = accent;
    this.movingLight.drawCircle(0, 0, 6);
    this.movingLight.fillColor = new Color(accent.r, accent.g, accent.b, 0.15);
    this.movingLight.drawCircle(0, 0, 17);
    this.panel = new Panel({ height: 112 });
    const heading = new Label('Transition gallery', { fontSize: 18, fontWeight: 'bold' });
    heading.setPosition(16, 12);
    this.detail = new Label('', { fontSize: 12, fillColor: new Color(174, 188, 198) });
    this.detail.setPosition(16, 86);
    this.selector = new Dropdown({
      height: 28,
      textStyle: { fontSize: 13 },
      selectedIndex: selected,
      items: transitions.map((entry, index) => ({ label: entry.label, value: index })),
    });
    this.selector.setPosition(16, 44);
    this.selector.onChange.add(index => {
      selected = index;
    });
    this.replay = new Button({ label: 'Replay', width: 88, height: 32, fontSize: 13 });
    this.replay.onClick.add(() => this.play());
    this.previous = new Button({ label: 'Prev', width: 52, height: 32, fontSize: 13 });
    this.next = new Button({ label: 'Next', width: 52, height: 32, fontSize: 13 });
    this.previous.onClick.add(() => this.select(-1));
    this.next.onClick.add(() => this.select(1));
    this.mode = new Label('', { fontSize: 13 });
    // The open list must paint above the replay button and the panel's labels.
    this.panel.addChild(heading, this.detail, this.replay, this.previous, this.mode, this.next, this.selector);
    this.location = new Label(this.observatory ? '02 / AMBER OBSERVATORY' : '01 / MINT HARBOR', {
      fontSize: 15,
      fontWeight: 'bold',
      fillColor: accent,
    });
    this.clock = new Label('', { fontSize: 12, fillColor: new Color(174, 188, 198) });
    this.ui.addChild(this.location, this.clock, this.panel);
    this.layout();
  }
  select(step) {
    selected = (selected + step + transitions.length) % transitions.length;
    this.selector.selectedIndex = selected;
  }
  drawLandscape(accent) {
    const sky = this.sky;
    sky.fillColor = new Color(230, 238, 247, 0.55);
    for (let i = 0; i < 38; i++) {
      sky.drawCircle(((i * 137) % 680) - 340, ((i * 71) % 220) - 190, i % 5 === 0 ? 2 : 1);
    }
    sky.fillColor = new Color(accent.r, accent.g, accent.b, 0.12);
    sky.drawCircle(165, -105, 66);
    sky.fillColor = accent;
    sky.drawCircle(165, -105, this.observatory ? 30 : 19);
    sky.fillColor = this.observatory ? new Color(65, 49, 83) : new Color(24, 67, 78);
    sky.drawPolygon([-360, 115, -280, -30, -160, 60, -55, -85, 80, 80, 215, -20, 360, 110]);
    sky.fillColor = this.observatory ? new Color(43, 35, 62) : new Color(16, 51, 65);
    sky.drawPolygon([-360, 160, -270, 65, -170, 105, -45, 15, 90, 115, 240, 60, 360, 150]);
    if (this.observatory) {
      sky.fillColor = new Color(143, 115, 151);
      sky.drawCircle(-35, 20, 68);
      sky.fillColor = new Color(91, 72, 112);
      sky.drawRectangle(-103, 20, 136, 101);
      sky.fillColor = new Color(41, 33, 58);
      sky.drawRectangle(-110, 94, 150, 30);
      sky.fillColor = accent;
      sky.drawRectangle(-82, 38, 94, 5);
      sky.drawRectangle(-15, -38, 12, 62);
      sky.drawPolygon([-18, -40, 36, -68, 47, -50, -7, -22]);
    } else {
      sky.fillColor = new Color(125, 170, 175);
      sky.drawPolygon([-80, 110, -65, -58, -20, -58, -5, 110]);
      sky.fillColor = accent;
      sky.drawRectangle(-72, -74, 59, 19);
      sky.fillColor = new Color(42, 89, 100);
      sky.drawPolygon([-82, -74, -42, -108, -3, -74]);
      sky.drawRectangle(-46, 70, 15, 40);
      sky.fillColor = new Color(40, 103, 111);
      sky.drawRectangle(-350, 122, 700, 60);
      sky.fillColor = new Color(123, 232, 210, 0.25);
      for (let i = 0; i < 10; i++) {
        sky.drawRectangle(-315 + i * 68, 138 + (i % 3) * 12, 38, 2);
      }
    }
    sky.fillColor = this.observatory ? new Color(26, 23, 40) : new Color(10, 31, 41);
    sky.drawPolygon([-360, 180, -270, 152, -170, 168, -85, 110, 50, 125, 150, 163, 280, 145, 360, 180]);
  }
  play() {
    if (playing) {
      return;
    }
    playing = true;
    failure = '';
    void this.app.scenes
      .change(this.observatory ? HarborScene : ObservatoryScene, { transition: transitions[selected].transition })
      .catch(() => {
        failure = 'Could not change scene. Try Replay again.';
      })
      .finally(() => {
        playing = false;
      });
  }
  layout() {
    const app = this.app;
    const canvas = app.canvas;
    const scale = unitsPerCssPixel(app, canvas);
    const width = app.width / scale;
    const height = app.height / scale;
    const compact = width < 500 || height < 320;
    this.ui.uiScale = scale;
    this.panel.setSize(width, 112);
    this.selector.setSize(Math.max(100, width - 136), 28);
    this.replay.setPosition(width - 104, compact ? 10 : 42);
    this.selector.visible = !compact;
    if (compact) {
      this.selector.close();
    }
    this.previous.visible = this.next.visible = this.mode.visible = compact;
    this.previous.setPosition(16, 44);
    this.next.setPosition(width - 68, 44);
    this.mode.setPosition(80, 51);
    this.mode.text = transitions[selected].label;
    this.detail.text = width < 420 ? 'Choose an effect, then Replay to swap scenes.' : transitions[selected].detail;
    this.location.setPosition(16, height - 50);
    this.clock.setPosition(16, height - 28);
    this.background.setScale(app.width, app.height);
    const artHeight = Math.max(60, height - 170);
    this.art.setScale(Math.min((width - 24) / 720, artHeight / 380) * scale);
    this.art.setPosition(app.width / 2, (112 + artHeight / 2) * scale);
  }
  update(delta) {
    this.time += delta;
    this.layout();
    this.selector.enabled = !playing;
    this.replay.enabled = !playing;
    this.previous.enabled = this.next.enabled = !playing;
    this.clock.text = failure || `Live ${this.time.toFixed(1)}s  /  Tab + Enter to play`;
    this.movingLight.setPosition(
      this.observatory ? Math.cos(this.time * 0.8) * 185 : Math.sin(this.time * 0.7) * 220,
      this.observatory ? Math.sin(this.time * 0.8) * 65 - 100 : 146,
    );
  }
}
class HarborScene extends GalleryScene {}
class ObservatoryScene extends GalleryScene {
  observatory = true;
}
const app = new Application({
  scenes: { HarborScene, ObservatoryScene },
  canvas: { width: 960, height: 640, mount: document.body, sizing: new ResponsiveCanvasSizing({ minAspect: 0.65 }) },
  clearColor: new Color(12, 35, 47),
});
await app.start(HarborScene);
