import { type Gamepad, GamepadAxis, GamepadButton, Scene } from '@codexo/exojs';

interface Camera {
  rotate(radians: number): void;
}

interface Player {
  dash(): void;
}

class ProbeScene extends Scene {
  private camera!: Camera;
  private player!: Player;

  // #region guide:capability-probe
  override init(): void {
    const pad = this.app.input.getGamepad(0);
    if (pad.hasChannel(GamepadAxis.RightStickX)) {
      pad.onActive(GamepadAxis.RightStickX, value => {
        this.camera.rotate(value * 2);
      });
    }

    if (pad.hasChannel(GamepadButton.Paddle1)) {
      pad.onActive(GamepadButton.Paddle1, () => {
        this.player.dash();
      });
    }
  }
  // #endregion guide:capability-probe
}

class VibrationScene extends Scene {
  // #region guide:vibration
  override init(): void {
    const pad = this.app.input.getGamepad(0);
    if (pad.canVibrate) {
      void pad.vibrate({
        duration: 200, // ms
        weakMagnitude: 0.5, // low-frequency rumble 0..1
        strongMagnitude: 0.8, // high-frequency rumble 0..1
        startDelay: 0,
      });
    }

    // Stop rumble early
    pad.stopVibration();
  }
  // #endregion guide:vibration
}

class HotplugScene extends Scene {
  private _activePad: Gamepad | null = null;

  // #region guide:hotplug
  override init(): void {
    const pad = this.app.input.firstConnectedGamepad;

    if (pad) {
      this.bindPad(pad);
    }

    this.app.input.onGamepadConnected.add(p => {
      if (!this._activePad) this.bindPad(p);
    });
  }
  // #endregion guide:hotplug

  private bindPad(pad: Gamepad): void {
    this._activePad = pad;
  }
}

export { HotplugScene, ProbeScene, VibrationScene };
