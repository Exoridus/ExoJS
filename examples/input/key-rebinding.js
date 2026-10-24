// Auto-generated from key-rebinding.ts - edit the .ts source, not this file.
import {
  ActionMap,
  Application,
  BindingProfile,
  ButtonAction,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  inputToken,
  Keyboard,
  Scene,
} from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
// A binding is persisted as a stable lowercase token ("keyboard.space"), never
// as an enum number: tokens survive an engine upgrade, a different browser, and
// a controller plugged into another port. This turns one back into something a
// player can read on screen.
const keyName = token => token?.replace(/^keyboard\./, '').replaceAll('-', ' ') ?? 'unbound';
// A BindingProfile stores only what the player CHANGED, so writing the whole
// thing to localStorage still leaves every action the game gains later at its
// own default.
const STORAGE_KEY = 'exo-example-key-rebinding';
const loadProfile = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return BindingProfile.fromJSON(JSON.parse(raw));
    }
  } catch {
    // Unavailable storage, or a profile written by an older build - either
    // way, fall through to the developer defaults.
  }
  return new BindingProfile();
};
const saveProfile = profile => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Non-fatal - persistence is best-effort.
  }
};
class KeyRebindingScene extends Scene {
  graphics;
  controls = new ActionMap({
    jump: new ButtonAction(Keyboard.Space),
    // Not `rebind`: an action name has to clear ActionMap's own surface, and
    // `rebind()` is the method this example calls three lines down.
    startRebind: new ButtonAction(Keyboard.J),
  });
  profile = loadProfile();
  rebindRequested = false;
  jumpVelocity = 0;
  heroY = 0;
  groundY = 0;
  hud;
  init() {
    const app = this.app;
    const { height } = app;
    this.groundY = height - 240;
    this.heroY = this.groundY;
    this.graphics = new Graphics();
    try {
      this.controls.applyProfile(this.profile);
    } catch {
      this.profile.clear();
      this.controls.applyProfile(null);
    }
    this.inputs.attach(this.controls);
    app.input.onKeyDown.add(this.onKeyDown);
    this.hud = mountControls({ theme: 'site', title: 'Key rebinding', hint: 'J rebinds on release. Escape cancels. R restores defaults.' });
    this.refreshHud();
  }
  onKeyDown = channel => {
    if (channel === Keyboard.Escape) {
      this.rebindRequested = false;
      this.refreshHud();
      return;
    }
    if (channel === Keyboard.R && !this.rebindRequested) {
      this.profile.clear();
      this.controls.applyProfile(null);
      saveProfile(this.profile);
      this.refreshHud();
      return;
    }
    if (!this.rebindRequested) {
      return;
    }
    this.rebindRequested = false;
    // Rebinding is atomic and baseline-safe: the key being pressed right
    // now does not read as a fresh jump on the very next frame.
    if (channel === Keyboard.J) {
      this.rebindRequested = true;
      this.hud.setStatus('J is reserved for rebind. Choose another key.');
      return;
    }
    this.controls.rebind('jump', channel);
    this.profile.set('jump', this.controls.jump.serialize());
    saveProfile(this.profile);
    this.refreshHud();
  };
  jumpToken() {
    return this.controls.jump.channels.map(inputToken)[0];
  }
  refreshHud() {
    this.hud.setStatus(
      this.rebindRequested ? 'Press any key to assign jump...' : `Jump: ${keyName(this.jumpToken())} (J rebind | Esc cancel | R reset)`,
    );
  }
  update(delta) {
    this.hud.fit(this.app, this.app.canvas);
    // Arm on the RELEASE of J, so the J keydown itself is not captured as
    // the new binding in the same frame.
    if (this.controls.startRebind.released && !this.rebindRequested) {
      this.rebindRequested = true;
      this.refreshHud();
    }
    if (this.controls.jump.pressed && this.heroY >= this.groundY - 0.5) {
      this.jumpVelocity = -560;
    }
    // Simple gravity so the rebound jump is visible.
    this.jumpVelocity = Math.min(900, this.jumpVelocity + 1800 * delta);
    this.heroY += this.jumpVelocity * delta;
    if (this.heroY > this.groundY) {
      this.heroY = this.groundY;
      this.jumpVelocity = 0;
    }
  }
  draw(context) {
    const app = this.app;
    const { width } = app;
    this.graphics.clear();
    // Static ground line, just below where the hero square rests.
    this.graphics.fillColor = new Color(40, 48, 64);
    this.graphics.drawRectangle(0, this.groundY + 40, width, 4);
    // Hero square - heroY is animated by the (rebindable) jump key.
    this.graphics.fillColor = new Color(255, 190, 90);
    this.graphics.drawRectangle(width / 2 - 20, this.heroY, 40, 40);
    context.render(this.graphics);
  }
  destroy() {
    this.app.input.onKeyDown.remove(this.onKeyDown);
    this.hud.dispose();
    this.graphics.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { KeyRebindingScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(10, 12, 20),
});
await app.start(KeyRebindingScene);
