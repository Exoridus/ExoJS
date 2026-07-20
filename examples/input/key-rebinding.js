// Auto-generated from key-rebinding.ts — edit the .ts source, not this file.
import { Application, Color, Graphics, Keyboard, Scene } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
// Reverse lookup from a Keyboard channel back to a human-readable key name, so
// the binding is shown as "Space" rather than the raw channel number. The
// Keyboard enum's reverse map (numeric value -> member name) gives this for free.
const KEY_NAMES = Keyboard;
function keyName(channel) {
    return KEY_NAMES[channel] ?? `Key ${channel}`;
}
// A serialisable mapping is exactly what makes a key-binding persist: write the
// plain object to localStorage on every rebind, read it back on load.
const STORAGE_KEY = 'exo-example-key-rebinding';
function loadProfile() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (typeof parsed.jump === 'number') {
                return { jump: parsed.jump };
            }
        }
    }
    catch {
        // localStorage may be unavailable (sandboxed) — fall through to default.
    }
    return { jump: Keyboard.Space };
}
function saveProfile(profile) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    }
    catch {
        // Non-fatal — persistence is best-effort.
    }
}
class KeyRebindingScene extends Scene {
    graphics;
    profile = loadProfile();
    rebindRequested = false;
    jumpVelocity = 0;
    heroY = 0;
    groundY = 0;
    jumpBinding;
    hud;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { height } = app.canvas;
        this.groundY = height - 240;
        this.heroY = this.groundY;
        this.graphics = new Graphics();
        // Tap J to arm a rebind; the next key pressed becomes the new jump key.
        // We arm on the *release* (onTrigger) so the J keydown itself isn't
        // captured as the new binding in the same frame.
        this.inputs.onTrigger(Keyboard.J, () => {
            this.rebindRequested = true;
            this.refreshHud();
        });
        app.input.onKeyDown.add(channel => {
            if (!this.rebindRequested) {
                return;
            }
            this.rebindRequested = false;
            this.profile.jump = channel;
            saveProfile(this.profile);
            this.bindJump();
            this.refreshHud();
        });
        this.bindJump();
        this.hud = mountControls({
            title: 'Key Rebinding',
            controls: [
                { keys: keyName(this.profile.jump), action: 'jump' },
                { keys: 'J', action: 'rebind jump' },
            ],
            status: '',
            hint: '',
        });
        this.refreshHud();
    }
    bindJump() {
        this.jumpBinding?.unbind();
        this.jumpBinding = this.inputs.onStart(this.profile.jump, () => {
            if (this.heroY >= this.groundY - 0.5) {
                this.jumpVelocity = -560;
            }
        });
    }
    refreshHud() {
        this.hud.setControls([
            { keys: keyName(this.profile.jump), action: 'jump' },
            { keys: 'J', action: 'rebind jump' },
        ]);
        this.hud.setStatus(`Jump key: ${keyName(this.profile.jump)} (saved)`);
        this.hud.setHint(this.rebindRequested ? 'Press any key to assign jump…' : 'Binding restored from localStorage on reload.');
    }
    update(delta) {
        // Simple gravity so the rebound jump is visible.
        this.jumpVelocity = Math.min(900, this.jumpVelocity + 1800 * delta.seconds);
        this.heroY += this.jumpVelocity * delta.seconds;
        if (this.heroY > this.groundY) {
            this.heroY = this.groundY;
            this.jumpVelocity = 0;
        }
    }
    draw(context) {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width } = app.canvas;
        context.backend.clear();
        this.graphics.clear();
        // Static ground line, just below where the hero square rests.
        this.graphics.fillColor = new Color(40, 48, 64);
        this.graphics.drawRectangle(0, this.groundY + 40, width, 4);
        // Hero square — heroY is animated by the (rebindable) jump key.
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
        sizingMode: 'fit',
    },
    clearColor: new Color(10, 12, 20),
    loader: {
        basePath: 'assets/',
    },
});
app.start(KeyRebindingScene);
