import type { GamepadAxis } from './GamepadAxis';
import type { GamepadAxisChannel } from './GamepadAxis';
import type { GamepadButton } from './GamepadButton';
import type { GamepadButtonChannel } from './GamepadButton';
import type { GamepadPromptControl } from './GamepadPromptLayouts';

/**
 * Device family a {@link GamepadMapping} belongs to.
 *
 * The value a game keys its own button-glyph or controller-artwork set on:
 * `icons[gamepad.family]`. Two devices share a family when a player would
 * recognise them as the same kind of controller, not merely when their button
 * layout matches.
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
 * that device unnormalised.
 */
export enum GamepadMappingLayout {
  /** Indices follow the W3C standard layout. */
  Standard = 'standard',
  /** Indices follow the device's raw HID report order. */
  Raw = 'raw',
}

/**
 * One device layout, as data.
 *
 * This is the whole definition of a controller as far as the engine is
 * concerned - no subclassing is involved, and a custom device is described by
 * writing one of these rather than by extending anything.
 */
export interface GamepadMappingData {
  /** Device family, for prompt labels and for the game's own artwork selection. */
  readonly family: GamepadMappingFamily;
  /** Index space `buttons` and `axes` are written against. Defaults to {@link GamepadMappingLayout.Standard}. */
  readonly layout?: GamepadMappingLayout;
  /** Buttons, addressed by the browser's `Gamepad.buttons[]` index. */
  readonly buttons: readonly GamepadButton[];
  /** Axes, addressed by the browser's `Gamepad.axes[]` index. */
  readonly axes: readonly GamepadAxis[];
  /**
   * Prompt labels that differ from this device's family default.
   *
   * A family spans several product generations whose buttons are not all named
   * the same - the PlayStation `Select` button reads "Select" on a PS3 pad,
   * "Share" on a DualShock 4 and "Create" on a DualSense, yet all three share
   * one family. List only the controls that differ.
   */
  readonly promptLabels?: ReadonlyMap<GamepadPromptControl, string>;
}

/**
 * Translation layer between the browser's raw
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Gamepad Gamepad API}
 * indices and ExoJS-canonical input channels.
 *
 * The engine selects one when a gamepad connects (see `GamepadDefinition`) and
 * uses it to route raw values to the correct channels every frame. Construct
 * one from {@link GamepadMappingData} to describe a device the built-in
 * definitions do not cover.
 */
export class GamepadMapping {
  /** Identifies the device family this mapping targets. */
  public readonly family: GamepadMappingFamily;

  /** Index space this mapping's button and axis indices are written against. */
  public readonly layout: GamepadMappingLayout;

  /** Ordered list of buttons, indexed by the Gamepad API button index. */
  public readonly buttons: readonly GamepadButton[];

  /** Ordered list of axes, indexed by the Gamepad API axis index. */
  public readonly axes: readonly GamepadAxis[];

  /** Device-specific prompt labels - see {@link GamepadMappingData.promptLabels}. */
  public readonly promptLabels: ReadonlyMap<GamepadPromptControl, string> | undefined;

  public constructor(data: GamepadMappingData) {
    this.family = data.family;
    this.layout = data.layout ?? GamepadMappingLayout.Standard;
    this.buttons = data.buttons;
    this.axes = data.axes;
    this.promptLabels = data.promptLabels;
  }

  /**
   * Returns `true` when this mapping declares at least one button or axis
   * control that writes to `channel`. Use to detect device-specific
   * capabilities at runtime - e.g. before binding an input to a
   * right-stick channel that may not exist on a single Joy-Con.
   *
   * @example
   * ```ts
   * if (gamepad.hasChannel(GamepadAxis.RightStickX)) {
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
}
