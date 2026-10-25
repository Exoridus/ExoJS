// Auto-generated from convolution-rooms.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Graphics, Keyboard, Scene, Text } from '@codexo/exojs';
import { ConvolutionEffect } from '@codexo/exojs/audio-fx';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { choice, demoPanel, trackPressButtons } from '@examples/runtime';
// Every impulse response in the AK-SROOMS set, shortest tail first. The
// duration is what actually decides the character: a few milliseconds only
// colours the sound, ~30-150 ms reads as a cupboard or a shaft, and past
// ~250 ms you start hearing a room you could walk around in.
const ROOMS = [
  { file: 'AK-SROOMS_014', ir: assets.impulseRoom014, ms: 1 },
  { file: 'AK-SROOMS_013', ir: assets.impulseRoom013, ms: 2 },
  { file: 'AK-SROOMS_023', ir: assets.impulseRoom023, ms: 3 },
  { file: 'AK-SROOMS_012', ir: assets.impulseRoom012, ms: 6 },
  { file: 'AK-SROOMS_011', ir: assets.impulseRoom011, ms: 11 },
  { file: 'AK-SROOMS_022', ir: assets.impulseRoom022, ms: 15 },
  { file: 'AK-SROOMS_002', ir: assets.impulseRoom002, ms: 20 },
  { file: 'AK-SROOMS_003', ir: assets.impulseRoom003, ms: 20 },
  { file: 'AK-SROOMS_010', ir: assets.impulseRoom010, ms: 28 },
  { file: 'AK-SROOMS_021', ir: assets.impulseRoom021, ms: 33 },
  { file: 'AK-SROOMS_009', ir: assets.impulseRoom009, ms: 48 },
  { file: 'AK-SROOMS_019', ir: assets.impulseRoom019, ms: 51 },
  { file: 'AK-SROOMS_020', ir: assets.impulseRoom020, ms: 95 },
  { file: 'AK-SROOMS_006', ir: assets.impulseRoom006, ms: 133 },
  { file: 'AK-SROOMS_018', ir: assets.impulseRoom018, ms: 156 },
  { file: 'AK-SROOMS_015', ir: assets.impulseRoom015, ms: 235 },
  { file: 'AK-SROOMS_001', ir: assets.impulseRoom001, ms: 236 },
  { file: 'AK-SROOMS_024', ir: assets.impulseRoom024, ms: 226 },
  { file: 'AK-SROOMS_026', ir: assets.impulseRoom026, ms: 226 },
  { file: 'AK-SROOMS_027', ir: assets.impulseRoom027, ms: 226 },
  { file: 'AK-SROOMS_025', ir: assets.impulseRoom025, ms: 229 },
  { file: 'AK-SROOMS_030', ir: assets.impulseRoom030, ms: 267 },
  { file: 'AK-SROOMS_004', ir: assets.impulseRoom004, ms: 307 },
  { file: 'AK-SROOMS_005', ir: assets.impulseRoom005, ms: 307 },
  { file: 'AK-SROOMS_029', ir: assets.impulseRoom029, ms: 308 },
  { file: 'AK-SROOMS_007', ir: assets.impulseRoom007, ms: 350 },
  { file: 'AK-SROOMS_008', ir: assets.impulseRoom008, ms: 350 },
  { file: 'AK-SROOMS_028', ir: assets.impulseRoom028, ms: 353 },
  { file: 'AK-SROOMS_017', ir: assets.impulseRoom017, ms: 550 },
  { file: 'AK-SROOMS_016', ir: assets.impulseRoom016, ms: 593 },
];
const ROOM_LABELS = ROOMS.map(room => `${room.ms} ms (IR ${room.file.slice(-3)})`);
/** Rough label for a tail length - the same intuition a level designer works with. */
const character = ms => {
  if (ms < 10) {
    return 'colouration only';
  }
  if (ms < 40) {
    return 'tight box';
  }
  if (ms < 120) {
    return 'narrow shaft';
  }
  if (ms < 250) {
    return 'small room';
  }
  if (ms < 400) {
    return 'chamber';
  }
  return 'cavern';
};
// Four distinct impact materials laid out left to right, so a strike's
// stereo position matches where it visually sits - the same left/right
// spread the ear hears back through the room.
const MATERIALS = [
  { sound: assets.soundImpactBellHeavy, label: 'Bell', color: new Color(210, 180, 100) },
  { sound: assets.soundImpactWoodHeavy, label: 'Wood', color: new Color(160, 120, 80) },
  { sound: assets.soundImpactGlassHeavy, label: 'Glass', color: new Color(130, 210, 230) },
  { sound: assets.soundImpactMetalHeavy, label: 'Metal', color: new Color(160, 180, 200) },
];
const REF_DISTANCE = 60;
const MAX_DISTANCE = 700;
class ConvolutionRoomsScene extends Scene {
  convolution;
  index = 0;
  pads = [];
  listener;
  gfx;
  label;
  detail;
  tapPrompt;
  panel;
  pressButtons = null;
  init() {
    const { width, height } = this.app;
    this.listener = { x: width / 2, y: height / 2 };
    this.app.audio.listener.target = this.listener;
    // No impulse yet - the effect passes audio through untouched until one
    // is set, so it is safe on the bus from the start.
    this.convolution = new ConvolutionEffect({ wet: 0.85 });
    this.app.audio.sound.addEffect(this.convolution);
    const padW = 220;
    const padH = 220;
    const gap = 40;
    const totalW = MATERIALS.length * padW + (MATERIALS.length - 1) * gap;
    const startX = (width - totalW) / 2;
    const padY = height / 2 - padH / 2 + 20;
    this.pads = MATERIALS.map((material, i) => ({
      sound: this.loader.get(material.sound),
      label: material.label,
      color: material.color,
      x: startX + i * (padW + gap),
      y: padY,
      w: padW,
      h: padH,
      flash: 0,
    }));
    this.gfx = new Graphics();
    this.label = new Text('', { fillColor: Color.white, fontSize: 26 }).setAnchor(0.5, 0.5).setPosition(width / 2, padY - 44);
    this.detail = new Text('', { fillColor: new Color(178, 191, 217), fontSize: 18 }).setAnchor(0.5, 0.5).setPosition(width / 2, padY - 14);
    this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 22 })
      .setAnchor(0.5, 0.5)
      .setPosition(width / 2, height - 48);
    const materialLabels = this.pads.map(pad =>
      new Text(pad.label, { fillColor: Color.white, fontSize: 20 }).setAnchor(0.5, 0.5).setPosition(pad.x + pad.w / 2, pad.y + pad.h + 26),
    );
    this.root.addChild(this.gfx, this.label, this.detail, this.tapPrompt, ...materialLabels);
    if (this.app.canvas instanceof HTMLCanvasElement) {
      this.pressButtons = trackPressButtons(this.app.canvas);
    }
    this.app.input.onPointerDown.add(this.onPointerDown);
    this.panel = demoPanel({
      scene: this,
      controls: { room: choice('Room', ROOM_LABELS) },
      onChange: (_key, value) => this.select(ROOM_LABELS.indexOf(value)),
    });
    this.inputs.onTrigger(Keyboard.Right, () => this.panel.step('room', 1));
    this.inputs.onTrigger(Keyboard.Left, () => this.panel.step('room', -1));
  }
  // Application input outlives the scene, so the handler is removed in destroy().
  onPointerDown = (pointer, x, y) => {
    // Presses are delivered at the next frame, when `pointer.buttons` already
    // reads the live state, so a right click released before then looks like a
    // main click. The button recorded at press time decides: only the main
    // button strikes.
    if ((this.pressButtons?.take(pointer.id) ?? 0) !== 0) {
      return;
    }
    for (const pad of this.pads) {
      if (x >= pad.x && x <= pad.x + pad.w && y >= pad.y && y <= pad.y + pad.h) {
        this.strike(pad);
        return;
      }
    }
  };
  /** Swap the impulse response. The handle heals in place, so the effect picks it up once decoded. */
  select(next) {
    this.index = next;
    const room = ROOMS[this.index];
    const ir = this.loader.get(room.ir);
    this.label.text = `${this.index + 1} / ${ROOMS.length}: ${character(room.ms)}`;
    this.detail.text = `${room.file}, ${room.ms} ms tail`;
    // `.loaded` resolves immediately for an already-decoded handle; the
    // effect stays on the previous IR until the new one is ready.
    void ir.loaded.then(() => {
      if (ROOMS[this.index]?.file === room.file) {
        this.convolution.setImpulse(ir);
      }
    });
  }
  strike(pad) {
    if (this.app.audio.locked) {
      return;
    }
    this.app.audio.play(pad.sound, {
      position: { x: pad.x + pad.w / 2, y: pad.y + pad.h / 2 },
      distanceModel: 'linear',
      refDistance: REF_DISTANCE,
      maxDistance: MAX_DISTANCE,
      rolloffFactor: 1,
    });
    pad.flash = 1;
  }
  update(time) {
    for (const pad of this.pads) {
      pad.flash = Math.max(0, pad.flash - time * 3);
    }
    this.tapPrompt.visible = this.app.audio.locked;
  }
  draw(context) {
    this.gfx.clear();
    for (const pad of this.pads) {
      const { color, flash } = pad;
      const lit = 0.4 + flash * 0.6;
      this.gfx.fillColor = new Color(Math.floor(color.r * lit), Math.floor(color.g * lit), Math.floor(color.b * lit));
      this.gfx.drawRoundedRectangle(pad.x, pad.y, pad.w, pad.h, 16);
    }
    context.render(this.root);
  }
  destroy() {
    this.app.input.onPointerDown.remove(this.onPointerDown);
    this.pressButtons?.dispose();
    this.app.audio.sound.removeEffect(this.convolution);
    this.convolution.destroy();
    this.panel.dispose();
    super.destroy();
  }
}
const application = new Application({
  scenes: { ConvolutionRoomsScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});
void application.start(ConvolutionRoomsScene);
