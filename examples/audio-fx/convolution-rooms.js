// Auto-generated from convolution-rooms.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Graphics, Scene, Text } from '@codexo/exojs';
import { ConvolutionEffect } from '@codexo/exojs-audio-fx';
import { mountControls } from '@examples/runtime';
// Every impulse response in the AK-SROOMS set, shortest tail first. The
// duration is what actually decides the character: a few milliseconds only
// colours the sound, ~30-150 ms reads as a cupboard or a shaft, and past
// ~250 ms you start hearing a room you could walk around in.
const ROOMS = [
  { file: 'AK-SROOMS_014', ms: 1 },
  { file: 'AK-SROOMS_013', ms: 2 },
  { file: 'AK-SROOMS_023', ms: 3 },
  { file: 'AK-SROOMS_012', ms: 6 },
  { file: 'AK-SROOMS_011', ms: 11 },
  { file: 'AK-SROOMS_022', ms: 15 },
  { file: 'AK-SROOMS_002', ms: 20 },
  { file: 'AK-SROOMS_003', ms: 20 },
  { file: 'AK-SROOMS_010', ms: 28 },
  { file: 'AK-SROOMS_021', ms: 33 },
  { file: 'AK-SROOMS_009', ms: 48 },
  { file: 'AK-SROOMS_019', ms: 51 },
  { file: 'AK-SROOMS_020', ms: 95 },
  { file: 'AK-SROOMS_006', ms: 133 },
  { file: 'AK-SROOMS_018', ms: 156 },
  { file: 'AK-SROOMS_015', ms: 235 },
  { file: 'AK-SROOMS_001', ms: 236 },
  { file: 'AK-SROOMS_024', ms: 226 },
  { file: 'AK-SROOMS_026', ms: 226 },
  { file: 'AK-SROOMS_027', ms: 226 },
  { file: 'AK-SROOMS_025', ms: 229 },
  { file: 'AK-SROOMS_030', ms: 267 },
  { file: 'AK-SROOMS_004', ms: 307 },
  { file: 'AK-SROOMS_005', ms: 307 },
  { file: 'AK-SROOMS_029', ms: 308 },
  { file: 'AK-SROOMS_007', ms: 350 },
  { file: 'AK-SROOMS_008', ms: 350 },
  { file: 'AK-SROOMS_028', ms: 353 },
  { file: 'AK-SROOMS_017', ms: 550 },
  { file: 'AK-SROOMS_016', ms: 593 },
];
/** Rough label for a tail length - the same intuition a level designer works with. */
function character(ms) {
  if (ms < 10) return 'colouration only';
  if (ms < 40) return 'tight box';
  if (ms < 120) return 'narrow shaft';
  if (ms < 250) return 'small room';
  if (ms < 400) return 'chamber';
  return 'cavern';
}
// Four distinct impact materials laid out left to right, so a strike's
// stereo position matches where it visually sits - the same left/right
// spread the ear hears back through the room.
const MATERIALS = [
  { file: 'impactBell_heavy_000', label: 'Bell', color: new Color(210, 180, 100) },
  { file: 'impactWood_heavy_000', label: 'Wood', color: new Color(160, 120, 80) },
  { file: 'impactGlass_heavy_000', label: 'Glass', color: new Color(130, 210, 230) },
  { file: 'impactMetal_heavy_000', label: 'Metal', color: new Color(160, 180, 200) },
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
  hud;
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
      sound: this.loader.get(`audio/${material.file}.ogg`),
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
    this.app.input.onPointerDown.add(pointer => {
      if (!(pointer.buttons & 1)) return;
      for (const pad of this.pads) {
        if (pointer.x >= pad.x && pointer.x <= pad.x + pad.w && pointer.y >= pad.y && pointer.y <= pad.y + pad.h) {
          this.strike(pad);
          return;
        }
      }
    });
    this.app.input.onContextMenu.add(() => this.select(this.index + 1));
    this.hud = mountControls({
      title: 'Convolution rooms',
      controls: [
        { keys: 'Click', action: 'strike a pad, panned to its position' },
        { keys: 'Right-click', action: 'next room' },
      ],
      status: 'Click or press any key to start…',
      hint: 'Same four materials every time — only the room around them changes.',
    });
    this.select(0);
  }
  /** Swap the impulse response. The handle heals in place, so the effect picks it up once decoded. */
  select(next) {
    this.index = (next + ROOMS.length) % ROOMS.length;
    const room = ROOMS[this.index];
    const ir = this.loader.get(`audio/ir/${room.file}.wav`);
    this.label.text = `${this.index + 1} / ${ROOMS.length} — ${character(room.ms)}`;
    this.detail.text = `${room.file} · ${room.ms} ms tail`;
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
    this.hud.setStatus(this.app.audio.locked ? 'Click or press any key to start…' : `Room ${this.index + 1} of ${ROOMS.length}`);
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
}
const application = new Application({
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
void application.start(ConvolutionRoomsScene);
