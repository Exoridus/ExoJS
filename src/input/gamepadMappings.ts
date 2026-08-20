import type { GamepadAxisChannel } from './GamepadAxis';
import { GamepadAxis } from './GamepadAxis';
import { GamepadButton } from './GamepadButton';
import { GamepadMapping, GamepadMappingFamily, GamepadMappingLayout } from './GamepadMapping';
import type { GamepadPromptControl } from './GamepadPromptLayouts';

/**
 * The W3C standard button layout, indices 0-16.
 *
 * The standard layout ends at index 16 (the Meta/Guide button). Browsers expose
 * exactly ONE device-specific slot beyond it, at index 17, and what sits there
 * depends on the device — Share on an Xbox Series pad, Capture on a Switch Pro,
 * the touchpad click on a DualShock 4 / DualSense. This baseline therefore
 * declares nothing at 17; a device adds its own entry.
 */
const standardButtons = (): GamepadButton[] => [
  new GamepadButton(0, GamepadButton.South),
  new GamepadButton(1, GamepadButton.East),
  new GamepadButton(2, GamepadButton.West),
  new GamepadButton(3, GamepadButton.North),
  new GamepadButton(4, GamepadButton.LeftShoulder),
  new GamepadButton(5, GamepadButton.RightShoulder),
  new GamepadButton(6, GamepadButton.LeftTrigger),
  new GamepadButton(7, GamepadButton.RightTrigger),
  new GamepadButton(8, GamepadButton.Select),
  new GamepadButton(9, GamepadButton.Start),
  new GamepadButton(10, GamepadButton.LeftStick),
  new GamepadButton(11, GamepadButton.RightStick),
  new GamepadButton(12, GamepadButton.DPadUp),
  new GamepadButton(13, GamepadButton.DPadDown),
  new GamepadButton(14, GamepadButton.DPadLeft),
  new GamepadButton(15, GamepadButton.DPadRight),
  new GamepadButton(16, GamepadButton.Guide),
];

/**
 * One physical stick, exposed three ways: two direction-split, non-negative
 * channels per axis for "buttons-style" subscriptions, and one signed aggregate
 * channel per axis for direct -1..1 consumption.
 *
 * Both raw indices travel with each entry as its `pair`, because a stick axis is
 * deadzoned on its pair's radius rather than on its own magnitude.
 */
const stickAxes = (xIndex: number, yIndex: number, channels: StickChannels): GamepadAxis[] => [
  new GamepadAxis(xIndex, channels.left, { invert: true, pair: yIndex }),
  new GamepadAxis(xIndex, channels.right, { pair: yIndex }),
  new GamepadAxis(yIndex, channels.up, { invert: true, pair: xIndex }),
  new GamepadAxis(yIndex, channels.down, { pair: xIndex }),
  new GamepadAxis(xIndex, channels.x, { bipolar: true, pair: yIndex }),
  new GamepadAxis(yIndex, channels.y, { bipolar: true, pair: xIndex }),
];

interface StickChannels {
  readonly left: GamepadAxisChannel;
  readonly right: GamepadAxisChannel;
  readonly up: GamepadAxisChannel;
  readonly down: GamepadAxisChannel;
  readonly x: GamepadAxisChannel;
  readonly y: GamepadAxisChannel;
}

const leftStickChannels: StickChannels = {
  left: GamepadAxis.LeftStickLeft,
  right: GamepadAxis.LeftStickRight,
  up: GamepadAxis.LeftStickUp,
  down: GamepadAxis.LeftStickDown,
  x: GamepadAxis.LeftStickX,
  y: GamepadAxis.LeftStickY,
};

const rightStickChannels: StickChannels = {
  left: GamepadAxis.RightStickLeft,
  right: GamepadAxis.RightStickRight,
  up: GamepadAxis.RightStickUp,
  down: GamepadAxis.RightStickDown,
  x: GamepadAxis.RightStickX,
  y: GamepadAxis.RightStickY,
};

const leftStickAxes = (): GamepadAxis[] => stickAxes(0, 1, leftStickChannels);

const rightStickAxes = (): GamepadAxis[] => stickAxes(2, 3, rightStickChannels);

/** The four bipolar auxiliary axes of the standard layout, split into eight half-channels. */
const auxiliaryAxes = (): GamepadAxis[] => [
  new GamepadAxis(4, GamepadAxis.AuxiliaryAxis0Negative, { invert: true }),
  new GamepadAxis(4, GamepadAxis.AuxiliaryAxis0Positive),
  new GamepadAxis(5, GamepadAxis.AuxiliaryAxis1Negative, { invert: true }),
  new GamepadAxis(5, GamepadAxis.AuxiliaryAxis1Positive),
  new GamepadAxis(6, GamepadAxis.AuxiliaryAxis2Negative, { invert: true }),
  new GamepadAxis(6, GamepadAxis.AuxiliaryAxis2Positive),
  new GamepadAxis(7, GamepadAxis.AuxiliaryAxis3Negative, { invert: true }),
  new GamepadAxis(7, GamepadAxis.AuxiliaryAxis3Positive),
];

/** Options for a device that follows the standard layout with at most one extra button. */
export interface StandardGamepadMappingOptions {
  /** Family to report. Defaults to {@link GamepadMappingFamily.GenericDualAnalog}. */
  readonly family?: GamepadMappingFamily;
  /** Device-specific buttons appended after the standard layout. Their raw indices must not collide with 0-16. */
  readonly extraButtons?: readonly GamepadButton[];
  /** Prompt labels that differ from the family default. */
  readonly promptLabels?: ReadonlyMap<GamepadPromptControl, string>;
}

/**
 * Baseline mapping for dual-analog controllers that follow the standard W3C
 * Gamepad API layout (axes 0-3 for both sticks, axes 4-7 auxiliary).
 *
 * Every standard-layout device is this layout plus a family tag and at most the
 * one device-specific button at index 17.
 */
export const createStandardGamepadMapping = (options: StandardGamepadMappingOptions = {}): GamepadMapping =>
  new GamepadMapping({
    family: options.family ?? GamepadMappingFamily.GenericDualAnalog,
    buttons: [...standardButtons(), ...(options.extraButtons ?? [])],
    axes: [...leftStickAxes(), ...rightStickAxes(), ...auxiliaryAxes()],
    ...(options.promptLabels !== undefined && { promptLabels: options.promptLabels }),
  });

/**
 * Microsoft Xbox controllers (Xbox One, Xbox Series X/S, and compatible
 * third-party XInput devices) over USB or Bluetooth.
 *
 * XInput follows the W3C standard layout natively. Index 17 is the Share button
 * of the Xbox Series pads (`XBOX_SERIES_X_BUTTON_SHARE == BUTTON_INDEX_COUNT`).
 *
 * The Elite paddles are deliberately absent: the Windows path is XInput, whose
 * `XINPUT_GAMEPAD` struct has no paddle bits, and no browser mapper emits them.
 * They are reachable only through WebHID and therefore belong to a custom
 * `GamepadDefinition`, not here.
 */
export const createXboxGamepadMapping = (): GamepadMapping =>
  createStandardGamepadMapping({
    family: GamepadMappingFamily.Xbox,
    extraButtons: [new GamepadButton(17, GamepadButton.Share)],
  });

/**
 * Console generation a PlayStation mapping targets.
 *
 * The three generations share one button layout but not one set of button
 * names, and only the two newer ones have a touchpad — so the generation
 * decides both the prompt labels and whether index 17 exists.
 */
export enum PlayStationGeneration {
  /** DualShock 3 and PS3-era third-party pads: "Select" / "Start", no touchpad. */
  PS3 = 'ps3',
  /** DualShock 4 and PS4-era third-party pads: "Share" / "Options". */
  PS4 = 'ps4',
  /** DualSense and DualSense Edge: "Create" / "Options". */
  PS5 = 'ps5',
}

const playStationLabelOverrides = new Map<PlayStationGeneration, ReadonlyMap<GamepadPromptControl, string>>([
  [
    PlayStationGeneration.PS3,
    new Map<GamepadPromptControl, string>([
      ['Select', 'Select'],
      ['Start', 'Start'],
    ]),
  ],
  [PlayStationGeneration.PS4, new Map<GamepadPromptControl, string>([['Select', 'Share']])],
]);

/**
 * Sony PlayStation controllers — DualShock 3, DualShock 4 and DualSense
 * (PS3 / PS4 / PS5) over USB or Bluetooth.
 *
 * On PS4 and PS5 pads index 17 is the touchpad **click**
 * (`DUALSHOCK_BUTTON_TOUCHPAD == DUAL_SENSE_BUTTON_TOUCHPAD == 17`); a PS3 pad
 * has no touchpad and stops at the standard index 16. Select/Share/Create sits
 * on the standard Select slot (index 8) on all three, so it needs no entry of
 * its own — it is only printed differently, which is what the per-generation
 * prompt labels carry.
 *
 * Touchpad *coordinates* are not available: browsers model the touchpad as a
 * button, and the standard axis set stops after the two sticks. Reading finger
 * positions requires WebHID and a custom `GamepadDefinition`.
 *
 * @param generation - Console generation of the physical pad. Defaults to
 * {@link PlayStationGeneration.PS5}, the layout an unrecognised Sony device is
 * most likely to have.
 */
export const createPlayStationGamepadMapping = (generation: PlayStationGeneration = PlayStationGeneration.PS5): GamepadMapping => {
  const promptLabels = playStationLabelOverrides.get(generation);

  return createStandardGamepadMapping({
    family: GamepadMappingFamily.PlayStation,
    extraButtons: generation === PlayStationGeneration.PS3 ? [] : [new GamepadButton(17, GamepadButton.Touchpad)],
    ...(promptLabels !== undefined && { promptLabels }),
  });
};

/**
 * Nintendo Switch Pro Controller over USB or Bluetooth.
 *
 * Index 17 is the Capture button (`SWITCH_PRO_BUTTON_CAPTURE ==
 * BUTTON_INDEX_COUNT`); Home maps to Guide, Minus/Plus to Select/Start.
 *
 * Some browsers only recognise the controller after it has been paired through
 * Steam or a dedicated driver.
 */
export const createSwitchProGamepadMapping = (): GamepadMapping =>
  createStandardGamepadMapping({
    family: GamepadMappingFamily.SwitchPro,
    extraButtons: [new GamepadButton(17, GamepadButton.Capture)],
  });

/**
 * Valve Steam Controller (`28de:1102`, `28de:1142`).
 *
 * The device is recognised by family — a game that ships Steam artwork gets to
 * pick it — but its LAYOUT is the generic standard one and is **not verified**
 * for this device. Chromium lists both product IDs in `gamepad_id_list.cc` as
 * `kXInputTypeNone` and normalises neither, so a raw Steam Controller may well
 * report a different index order than the standard layout assumed here; no
 * hardware confirmation exists either way. With Steam Input active the device
 * instead appears as `28de:11ff` "Steam Virtual Gamepad", which genuinely is
 * standard-mapped.
 *
 * The right trackpad is surfaced as the right stick and the left trackpad as
 * the left stick. Gyro and haptic-only inputs are not represented.
 */
export const createSteamControllerGamepadMapping = (): GamepadMapping => createStandardGamepadMapping({ family: GamepadMappingFamily.SteamController });

/**
 * Generic arcade-stick controllers.
 *
 * Covers the standard 8-button plus shoulder/trigger layout common to most
 * fightsticks. No analog sticks are present, so the axis list is empty and the
 * D-pad is exposed as discrete buttons (indices 12-15).
 */
export const createArcadeStickGamepadMapping = (): GamepadMapping =>
  new GamepadMapping({
    family: GamepadMappingFamily.ArcadeStick,
    buttons: standardButtons().filter(button => button.index !== 10 && button.index !== 11),
    axes: [],
  });

/**
 * Valve Steam Deck (and the new Valve Controller via vendor fallback) when its
 * raw HID gamepad is exposed directly to the browser — i.e. when Steam Input is
 * *not* intercepting the device. With Steam Input intercepting, the device
 * appears as `28de:11ff` "Steam Virtual Gamepad" with a standard W3C layout
 * instead.
 *
 * The raw layout is non-standard: face buttons live at indices 3-6 (not the
 * W3C-standard 0-3), the D-pad at 16-19, paddles at 20-23, and triggers report
 * as analog axes 8/9 rather than buttons 6/7. Indices are derived from the Linux
 * SDL_GameControllerDB entry for `Valve Steam Deck`.
 *
 * Because those indices are raw rather than W3C-standard, this mapping declares
 * {@link GamepadMappingLayout.Raw}: should a browser ever report the same device
 * as `mapping: "standard"`, `resolveGamepadDefinition` discards this layout in
 * favour of the generic one rather than routing standard indices through raw
 * slots.
 */
export const createSteamDeckGamepadMapping = (): GamepadMapping =>
  new GamepadMapping({
    family: GamepadMappingFamily.SteamDeck,
    layout: GamepadMappingLayout.Raw,
    buttons: [
      // Quick Access (Steam Deck "..." button) - mapped to Capture as the
      // closest semantic match in the canonical channel set.
      new GamepadButton(2, GamepadButton.Capture),
      // Face cluster - non-standard offsets.
      new GamepadButton(3, GamepadButton.South),
      new GamepadButton(4, GamepadButton.East),
      new GamepadButton(5, GamepadButton.West),
      new GamepadButton(6, GamepadButton.North),
      new GamepadButton(7, GamepadButton.LeftShoulder),
      new GamepadButton(8, GamepadButton.RightShoulder),
      // View / Menu / Steam buttons.
      new GamepadButton(11, GamepadButton.Select),
      new GamepadButton(12, GamepadButton.Start),
      new GamepadButton(13, GamepadButton.Guide),
      // Stick clicks.
      new GamepadButton(14, GamepadButton.LeftStick),
      new GamepadButton(15, GamepadButton.RightStick),
      // D-pad.
      new GamepadButton(16, GamepadButton.DPadUp),
      new GamepadButton(17, GamepadButton.DPadDown),
      new GamepadButton(18, GamepadButton.DPadLeft),
      new GamepadButton(19, GamepadButton.DPadRight),
      // Back paddles. SDL labels them paddle1=R4, paddle2=L4, paddle3=R5,
      // paddle4=L5; exposed here in canonical L4/R4/L5/R5 order via
      // Paddle1..Paddle4.
      new GamepadButton(20, GamepadButton.Paddle2),
      new GamepadButton(21, GamepadButton.Paddle1),
      new GamepadButton(22, GamepadButton.Paddle4),
      new GamepadButton(23, GamepadButton.Paddle3),
    ],
    axes: [
      ...leftStickAxes(),
      ...rightStickAxes(),
      // Triggers as analog axes: the Steam Deck reports them as a8/a9, not
      // buttons 6/7 the way a W3C-standard-mapped device would - raw button
      // index 8 is already claimed by RightShoulder above, so the pull amount
      // can only arrive via axes[]. They still route to the SAME canonical
      // trigger channels every other family uses, so
      // `new ButtonAction(GamepadButton.RightTrigger)` works uniformly. Raw
      // axes report -1..+1; normalize to the 0..1 pull range.
      new GamepadAxis(8, GamepadButton.RightTrigger, { normalize: true }),
      new GamepadAxis(9, GamepadButton.LeftTrigger, { normalize: true }),
    ],
  });

/**
 * Nintendo Joy-Con (L) held horizontally as a solo controller.
 *
 * Declares only channels that physically exist on the device — one stick
 * (surfaced through the LeftStick channels so gamepad-agnostic code that binds
 * "the stick" works regardless of which half is held), four face buttons, the L
 * and ZL outer shoulders, the SL/SR rail buttons, Minus, Capture, and the
 * stick-click. Right-stick channels, Plus/Home, Touchpad and auxiliary axes are
 * intentionally absent — use `Gamepad.hasChannel` before binding anything that
 * may not exist on every family.
 *
 * The SL/SR rail buttons take paddle channels rather than the standard shoulder
 * channels, which belong to the physical L and ZL. Naming the channel after the
 * physical button is what keeps the prompt labels honest: `LeftShoulder` renders
 * as "L" and `LeftTrigger` as "ZL", so a prompt only points at the right button
 * when those channels carry the buttons actually labelled that way. Which of
 * them is comfortable in the horizontal solo grip is a question for the game's
 * binding layer.
 *
 * The specific slots follow SDL, which assigns the rail buttons by the hand they
 * sit under rather than by grip: left SL is `SDL_GAMEPAD_BUTTON_LEFT_PADDLE1`
 * (this engine's `Paddle1`) and left SR is `LEFT_PADDLE2` (`Paddle3`). The right
 * half takes the two right-hand slots, so a pair of solo Joy-Cons never collides
 * on a paddle channel.
 *
 * Button indices are verified against hardware (Chromium on Windows, Bluetooth,
 * `057e:2006`), which reports the pad as `mapping: "standard"` with 17 buttons
 * and 2 axes.
 */
export const createJoyConLeftGamepadMapping = (): GamepadMapping =>
  new GamepadMapping({
    family: GamepadMappingFamily.JoyConLeft,
    buttons: [
      new GamepadButton(0, GamepadButton.South),
      new GamepadButton(1, GamepadButton.East),
      new GamepadButton(2, GamepadButton.West),
      new GamepadButton(3, GamepadButton.North),
      new GamepadButton(4, GamepadButton.Paddle1), // SL - upper-left paddle slot
      new GamepadButton(5, GamepadButton.Paddle3), // SR - lower-left paddle slot
      new GamepadButton(6, GamepadButton.LeftTrigger), // ZL
      new GamepadButton(8, GamepadButton.LeftShoulder), // L
      new GamepadButton(9, GamepadButton.Select), // Minus
      new GamepadButton(10, GamepadButton.LeftStick), // stick click
      new GamepadButton(16, GamepadButton.Capture),
    ],
    axes: leftStickAxes(),
  });

/**
 * Nintendo Joy-Con (R) held horizontally as a solo controller.
 *
 * Mirrors {@link createJoyConLeftGamepadMapping} — see it for why the lone stick
 * takes the LeftStick channels and why the SL/SR rail buttons take paddle
 * channels. Following SDL, this half takes the two right-hand slots: SR is
 * `SDL_GAMEPAD_BUTTON_RIGHT_PADDLE1` (`Paddle2`) and SL is `RIGHT_PADDLE2`
 * (`Paddle4`).
 *
 * Button indices are verified against hardware (Chromium on Windows, Bluetooth,
 * `057e:2007`), which reports the pad as `mapping: "standard"` with 17 buttons
 * and 2 axes.
 */
export const createJoyConRightGamepadMapping = (): GamepadMapping =>
  new GamepadMapping({
    family: GamepadMappingFamily.JoyConRight,
    buttons: [
      new GamepadButton(0, GamepadButton.South),
      new GamepadButton(1, GamepadButton.East),
      new GamepadButton(2, GamepadButton.West),
      new GamepadButton(3, GamepadButton.North),
      new GamepadButton(4, GamepadButton.Paddle4), // SL - lower-right paddle slot
      new GamepadButton(5, GamepadButton.Paddle2), // SR - upper-right paddle slot
      new GamepadButton(7, GamepadButton.RightTrigger), // ZR
      new GamepadButton(8, GamepadButton.RightShoulder), // R
      new GamepadButton(9, GamepadButton.Start), // Plus
      new GamepadButton(10, GamepadButton.LeftStick), // stick click
      new GamepadButton(16, GamepadButton.Guide), // Home
    ],
    axes: leftStickAxes(),
  });
