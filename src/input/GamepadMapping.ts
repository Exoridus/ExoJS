import type { GamepadAxis } from './GamepadAxis';
import type { GamepadAxisChannel } from './GamepadAxis';
import type { GamepadButton } from './GamepadButton';
import type { GamepadButtonChannel } from './GamepadButton';
import type { GamepadPromptControl } from './GamepadPromptLayouts';

/**
 * Discriminant tag identifying which device family a {@link GamepadMapping} belongs to.
 * Used to select the correct mapping at runtime when a gamepad connects.
 */
export enum GamepadMappingFamily {
  GenericDualAnalog = 'genericDualAnalog',
  Xbox = 'xbox',
  PlayStation = 'playStation',
  SwitchPro = 'switchPro',
  JoyConLeft = 'joyConLeft',
  JoyConRight = 'joyConRight',
  SteamController = 'steamController',
  SteamDeck = 'steamDeck',
  ArcadeStick = 'arcadeStick',
}

/**
 * Which index space a {@link GamepadMapping}'s button and axis indices live in.
 *
 * Almost every mapping is written against the W3C "standard" layout the browser
 * normalises known devices into. A `Raw` mapping instead encodes a device's
 * unnormalised HID report order, which is only correct while the browser leaves
 * that device unnormalised — see {@link SteamDeckGamepadMapping}, the one
 * built-in mapping in that category.
 */
export enum GamepadMappingLayout {
  /** Indices follow the W3C standard layout. */
  Standard = 'standard',
  /** Indices follow the device's raw HID report order. */
  Raw = 'raw',
}

/**
 * Abstract translation layer between the browser's raw {@link https://developer.mozilla.org/en-US/docs/Web/API/Gamepad Gamepad API}
 * indices and ExoJS-canonical channel buffers.
 *
 * Each concrete subclass encodes one device family's button/axis layout as
 * ordered arrays of {@link GamepadButton} / {@link GamepadAxis} instances.
 * The engine selects the appropriate mapping when a gamepad connects and
 * uses it to route raw values to the correct input channels every frame.
 */
export abstract class GamepadMapping {
  /** Identifies the device family this mapping targets. */
  public abstract readonly family: GamepadMappingFamily;

  /**
   * Index space this mapping's button and axis indices are written against.
   *
   * Defaults to {@link GamepadMappingLayout.Standard}. A mapping that encodes
   * raw HID report order must declare {@link GamepadMappingLayout.Raw}, so
   * `resolveGamepadDefinition` can discard it when the browser reports the same
   * device as already standard-normalised.
   */
  public readonly layout: GamepadMappingLayout = GamepadMappingLayout.Standard;

  /** Ordered list of buttons, indexed by the Gamepad API button index. */
  public readonly buttons: readonly GamepadButton[];

  /** Ordered list of axes, indexed by the Gamepad API axis index. */
  public readonly axes: readonly GamepadAxis[];

  /**
   * Device-specific prompt labels, applied on top of the family label set by
   * {@link GamepadPromptLayouts.getControlLabels}.
   *
   * A {@link GamepadMappingFamily} spans several product generations whose
   * buttons are not all named the same — the PlayStation `Select` button reads
   * "Select" on a PS3 pad, "Share" on a DualShock 4 and "Create" on a
   * DualSense, yet all three share one family. Declare only the controls that
   * differ from the family default here; `undefined` means the family set
   * already labels this device correctly.
   */
  public readonly promptLabels?: ReadonlyMap<GamepadPromptControl, string> | undefined;

  protected constructor(buttons: readonly GamepadButton[], axes: readonly GamepadAxis[], promptLabels?: ReadonlyMap<GamepadPromptControl, string>) {
    this.buttons = buttons;
    this.axes = axes;
    this.promptLabels = promptLabels;
  }

  /**
   * Returns `true` when this mapping declares at least one button or axis
   * control that writes to `channel`. Use to detect device-specific
   * capabilities at runtime — e.g. before binding an input to a
   * right-stick channel that may not exist on a single Joy-Con.
   *
   * @example
   * ```ts
   * if (gamepad.mapping?.hasChannel(GamepadAxis.RightStickX)) {
   *     pad.onActive(GamepadAxis.RightStickX, (v) => crosshair.x += v * 8);
   * }
   * ```
   */
  public hasChannel(channel: GamepadButtonChannel | GamepadAxisChannel): boolean {
    for (const button of this.buttons) {
      if (button.channel === channel) {
        return true;
      }
    }

    for (const axis of this.axes) {
      if (axis.channel === channel) {
        return true;
      }
    }

    return false;
  }

  /**
   * Releases all button and axis control references held by this mapping.
   * Call when the associated gamepad disconnects to allow garbage collection.
   */
  public destroy(): void {
    (this.buttons as GamepadButton[]).length = 0;
    (this.axes as GamepadAxis[]).length = 0;
  }
}
