// Auto-generated from transition-gallery.ts - edit the .ts source, not this file.
import {
  Application,
  Color,
  Container,
  CrossFadeSceneTransition,
  Ease,
  FadeSceneTransition,
  Graphics,
  Keyboard,
  ResponsiveCanvasSizing,
  Scene,
  SlideSceneTransition,
  Text,
  Time,
} from '@codexo/exojs';
import { GallerySceneTransition } from '@examples/gallery-transitions';
import { startExample, unitsPerCssPixel } from '@examples/runtime';
const transitions = [
  {
    label: 'Fade through black',
    transition: new FadeSceneTransition({ duration: Time.seconds(0.4) }),
  },
  {
    label: 'Crossfade',
    transition: new CrossFadeSceneTransition({ duration: Time.seconds(0.9) }),
  },
  {
    label: 'Slide / push',
    transition: new SlideSceneTransition({ direction: 'left', mode: 'push', duration: Time.seconds(0.4), easing: Ease.cubicInOut }),
  },
  {
    label: 'Slide / cover',
    transition: new SlideSceneTransition({ direction: 'left', mode: 'cover', duration: Time.seconds(0.4), easing: Ease.cubicInOut }),
  },
  {
    label: 'Slide / reveal',
    transition: new SlideSceneTransition({ direction: 'right', mode: 'reveal', duration: Time.seconds(0.4), easing: Ease.cubicInOut }),
  },
  { label: 'Mask / iris', transition: new GallerySceneTransition('iris') },
  {
    label: 'Shader / dissolve',
    transition: new GallerySceneTransition('dissolve'),
  },
  {
    label: 'Snapshot / drift',
    transition: new GallerySceneTransition('snapshot'),
  },
];
let selected = 0;
let playing = false;
let failure = '';
class GalleryScene extends Scene {
  observatory = false;
  art = new Container();
  sky = new Graphics();
  movingLight = new Graphics();
  background = new Graphics();
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
    this.background.interactive = true;
    this.background.onPointerTap.add(() => this.play());
    this.inputs.onTrigger(Keyboard.Space, () => this.play());
    this.location = new Text(this.observatory ? 'AMBER OBSERVATORY' : 'MINT HARBOR', { fillColor: accent, fontWeight: 'bold' });
    this.clock = new Text('', { fillColor: new Color(174, 188, 198) });
    this.root.addChild(this.location, this.clock);
    this.layout();
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
      .then(() => {
        selected = (selected + 1) % transitions.length;
      })
      .catch(() => {
        failure = 'Could not change scene. Click to retry.';
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
    this.background.setScale(app.width, app.height);
    this.location.style.fontSize = 15 * scale;
    this.location.setPosition(16 * scale, 16 * scale);
    this.clock.style.fontSize = 13 * scale;
    this.clock.setPosition(16 * scale, (height - 32) * scale);
    const artHeight = Math.max(60, height - 100);
    this.art.setScale(Math.min((width - 24) / 720, artHeight / 380) * scale);
    this.art.setPosition(app.width / 2, app.height / 2);
  }
  update(delta) {
    this.time += delta;
    this.layout();
    this.clock.text = failure || `${playing ? 'Playing' : 'Next'}: ${transitions[selected].label}`;
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
await startExample(app, () => app.start(HarborScene));
