import {
  ActionMap,
  Application,
  BindingProfile,
  ButtonAction,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  type InputToken,
  inputToken,
  Keyboard,
  type RenderingContext,
  Scene,
  type Seconds,
} from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

// A binding is persisted as a stable lowercase token ("keyboard.space"), never
// as an enum number: tokens survive an engine upgrade, a different browser, and
// a controller plugged into another port. This turns one back into something a
// player can read on screen.
function keyName(token: InputToken | undefined): string {
  return token?.replace(/^keyboard\./, '').replaceAll('-', ' ') ?? 'unbound';
}

// A BindingProfile stores only what the player CHANGED, so writing the whole
// thing to localStorage still leaves every action the game gains later at its
// own default.
const STORAGE_KEY = 'exo-example-key-rebinding';

function loadProfile(): BindingProfile {
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
}

function saveProfile(profile: BindingProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Non-fatal - persistence is best-effort.
  }
}

class KeyRebindingScene extends Scene {
  private graphics!: Graphics;
  private controls = new ActionMap({
    jump: new ButtonAction(Keyboard.Space),
    rebind: new ButtonAction(Keyboard.J),
  });

  private profile = loadProfile();
  private rebindRequested = false;
  private jumpVelocity = 0;
  private heroY = 0;
  private groundY = 0;
  private hud!: ReturnType<typeof mountControls>;

  override init(): void {
    const app = this.app;
    const { height } = app;

    this.groundY = height - 240;
    this.heroY = this.groundY;
    this.graphics = new Graphics();

    this.controls.applyProfile(this.profile);
    this.inputs.attach(this.controls);

    app.input.onKeyDown.add(channel => {
      if (!this.rebindRequested) {
        return;
      }

      this.rebindRequested = false;
      // Rebinding is atomic and baseline-safe: the key being pressed right
      // now does not read as a fresh jump on the very next frame.
      this.controls.rebind('jump', channel);
      this.profile.set('jump', this.controls.jump.serialize());
      saveProfile(this.profile);
      this.refreshHud();
    });

    this.hud = mountControls({
      title: 'Key Rebinding',
      controls: this.hudControls(),
      status: '',
      hint: '',
    });

    this.refreshHud();
  }

  private jumpToken(): InputToken | undefined {
    return this.controls.jump.channels.map(inputToken)[0];
  }

  private hudControls(): { keys: string; action: string }[] {
    return [
      { keys: keyName(this.jumpToken()), action: 'jump' },
      { keys: 'J', action: 'rebind jump' },
    ];
  }

  private refreshHud(): void {
    this.hud.setControls(this.hudControls());
    this.hud.setStatus(`Jump key: ${keyName(this.jumpToken())} (saved)`);
    this.hud.setHint(this.rebindRequested ? 'Press any key to assign jump…' : 'Binding restored from localStorage on reload.');
  }

  override update(delta: Seconds): void {
    // Arm on the RELEASE of J, so the J keydown itself is not captured as
    // the new binding in the same frame.
    if (this.controls.rebind.released && !this.rebindRequested) {
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

  override draw(context: RenderingContext): void {
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
  loader: {
    basePath: 'assets/',
  },
});

app.start(KeyRebindingScene);
