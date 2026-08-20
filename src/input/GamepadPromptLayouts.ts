import type { GamepadButtonChannel } from './GamepadButton';
import { GamepadButton } from './GamepadButton';
import type { GamepadMapping } from './GamepadMapping';
import { GamepadMappingFamily } from './GamepadMapping';

/**
 * Named controls that can appear in an in-game prompt or button-hint UI.
 *
 * Intentionally a subset of {@link GamepadButton} channels - covers the
 * controls a typical prompt overlay needs to label, including the composite
 * `'DPad'` token which has no single channel equivalent. The names retain
 * a `'Button'` prefix on the face cluster for compatibility with prompt
 * artwork file names.
 */
export type GamepadPromptControl =
  | 'DPad'
  | 'DPadUp'
  | 'DPadDown'
  | 'DPadLeft'
  | 'DPadRight'
  | 'ButtonNorth'
  | 'ButtonWest'
  | 'ButtonEast'
  | 'ButtonSouth'
  | 'LeftShoulder'
  | 'RightShoulder'
  | 'LeftTrigger'
  | 'RightTrigger'
  | 'Select'
  | 'Start'
  | 'LeftStick'
  | 'RightStick'
  | 'Paddle1'
  | 'Paddle2'
  | 'Paddle3'
  | 'Paddle4';

const basePositions = new Map<GamepadPromptControl, readonly [number, number]>([
  ['DPad', [0.22, 0.58]],
  ['DPadUp', [0.22, 0.5]],
  ['DPadDown', [0.22, 0.66]],
  ['DPadLeft', [0.14, 0.58]],
  ['DPadRight', [0.3, 0.58]],
  ['ButtonNorth', [0.78, 0.5]],
  ['ButtonWest', [0.7, 0.58]],
  ['ButtonEast', [0.86, 0.58]],
  ['ButtonSouth', [0.78, 0.66]],
  ['LeftShoulder', [0.28, 0.28]],
  ['RightShoulder', [0.72, 0.28]],
  ['LeftTrigger', [0.2, 0.16]],
  ['RightTrigger', [0.8, 0.16]],
  ['Select', [0.46, 0.5]],
  ['Start', [0.54, 0.5]],
  ['LeftStick', [0.38, 0.66]],
  ['RightStick', [0.62, 0.66]],
  // Paddles sit on the back of the device; the silhouette shows them below the
  // grips, upper pair first, mirrored left/right the way the channels are.
  ['Paddle1', [0.32, 0.82]],
  ['Paddle2', [0.68, 0.82]],
  ['Paddle3', [0.26, 0.92]],
  ['Paddle4', [0.74, 0.92]],
]);

const channelMap = new Map<GamepadPromptControl, GamepadButtonChannel>([
  ['ButtonNorth', GamepadButton.North],
  ['ButtonWest', GamepadButton.West],
  ['ButtonEast', GamepadButton.East],
  ['ButtonSouth', GamepadButton.South],
  ['LeftShoulder', GamepadButton.LeftShoulder],
  ['RightShoulder', GamepadButton.RightShoulder],
  ['LeftTrigger', GamepadButton.LeftTrigger],
  ['RightTrigger', GamepadButton.RightTrigger],
  ['Select', GamepadButton.Select],
  ['Start', GamepadButton.Start],
  ['LeftStick', GamepadButton.LeftStick],
  ['RightStick', GamepadButton.RightStick],
  ['DPadUp', GamepadButton.DPadUp],
  ['DPadDown', GamepadButton.DPadDown],
  ['DPadLeft', GamepadButton.DPadLeft],
  ['DPadRight', GamepadButton.DPadRight],
  ['Paddle1', GamepadButton.Paddle1],
  ['Paddle2', GamepadButton.Paddle2],
  ['Paddle3', GamepadButton.Paddle3],
  ['Paddle4', GamepadButton.Paddle4],
]);

const createLabels = (
  base: ReadonlyMap<GamepadPromptControl, string>,
  overrides: ReadonlyArray<readonly [GamepadPromptControl, string]>,
): ReadonlyMap<GamepadPromptControl, string> => new Map<GamepadPromptControl, string>([...base, ...overrides]);

const genericLabels = new Map<GamepadPromptControl, string>([
  ['ButtonNorth', 'North'],
  ['ButtonWest', 'West'],
  ['ButtonEast', 'East'],
  ['ButtonSouth', 'South'],
  ['LeftShoulder', 'L1'],
  ['RightShoulder', 'R1'],
  ['LeftTrigger', 'L2'],
  ['RightTrigger', 'R2'],
  ['Select', 'Select'],
  ['Start', 'Start'],
  ['LeftStick', 'L3'],
  ['RightStick', 'R3'],
  ['Paddle1', 'P1'],
  ['Paddle2', 'P2'],
  ['Paddle3', 'P3'],
  ['Paddle4', 'P4'],
]);

const xboxLabels = new Map<GamepadPromptControl, string>([
  ['ButtonNorth', 'Y'],
  ['ButtonWest', 'X'],
  ['ButtonEast', 'B'],
  ['ButtonSouth', 'A'],
  ['LeftShoulder', 'LB'],
  ['RightShoulder', 'RB'],
  ['LeftTrigger', 'LT'],
  ['RightTrigger', 'RT'],
  ['Select', 'View'],
  ['Start', 'Menu'],
  ['LeftStick', 'L3'],
  ['RightStick', 'R3'],
  // Elite Series 2 prints P1-P4 on the paddles.
  ['Paddle1', 'P1'],
  ['Paddle2', 'P2'],
  ['Paddle3', 'P3'],
  ['Paddle4', 'P4'],
]);

/**
 * DualSense names. The PlayStation family also covers PS3 pads ("Select" /
 * "Start") and DualShock 4 ("Share"); those generations override the two
 * differing entries through {@link GamepadMapping.promptLabels}.
 */
const playStationLabels = new Map<GamepadPromptControl, string>([
  ['ButtonNorth', 'Triangle'],
  ['ButtonWest', 'Square'],
  ['ButtonEast', 'Circle'],
  ['ButtonSouth', 'Cross'],
  ['LeftShoulder', 'L1'],
  ['RightShoulder', 'R1'],
  ['LeftTrigger', 'L2'],
  ['RightTrigger', 'R2'],
  ['Select', 'Create'],
  ['Start', 'Options'],
  ['LeftStick', 'L3'],
  ['RightStick', 'R3'],
]);

const switchLabels = new Map<GamepadPromptControl, string>([
  ['ButtonNorth', 'X'],
  ['ButtonWest', 'Y'],
  ['ButtonEast', 'A'],
  ['ButtonSouth', 'B'],
  ['LeftShoulder', 'L'],
  ['RightShoulder', 'R'],
  ['LeftTrigger', 'ZL'],
  ['RightTrigger', 'ZR'],
  ['Select', 'Minus'],
  ['Start', 'Plus'],
  ['LeftStick', 'L3'],
  ['RightStick', 'R3'],
]);

/**
 * Solo Joy-Con (L). The SL/SR rail buttons report paddle channels - see
 * {@link JoyConLeftGamepadMapping} - and this half takes the two left-hand
 * slots, so only those two carry a label.
 */
const joyConLeftLabels = createLabels(switchLabels, [
  ['Paddle1', 'SL'],
  ['Paddle3', 'SR'],
]);

/** Solo Joy-Con (R), taking the two right-hand paddle slots. */
const joyConRightLabels = createLabels(switchLabels, [
  ['Paddle2', 'SR'],
  ['Paddle4', 'SL'],
]);

/**
 * Steam Deck. Valve prints A/B/X/Y on the face cluster and View/Menu beside
 * it, but keeps the PlayStation-style L1/R1/L2/R2 shoulder names, so this is
 * neither the generic nor the Xbox set. The back paddles are L4/R4/L5/R5, in
 * the {@link GamepadButton.Paddle1}-to-`Paddle4` order
 * {@link SteamDeckGamepadMapping} writes them in.
 */
const steamDeckLabels = createLabels(genericLabels, [
  ['ButtonNorth', 'Y'],
  ['ButtonWest', 'X'],
  ['ButtonEast', 'B'],
  ['ButtonSouth', 'A'],
  ['Select', 'View'],
  ['Start', 'Menu'],
  ['Paddle1', 'L4'],
  ['Paddle2', 'R4'],
  ['Paddle3', 'L5'],
  ['Paddle4', 'R5'],
]);

const promptLabelsByFamily = new Map<GamepadMappingFamily, ReadonlyMap<GamepadPromptControl, string>>([
  [GamepadMappingFamily.GenericDualAnalog, genericLabels],
  [GamepadMappingFamily.Xbox, xboxLabels],
  [GamepadMappingFamily.PlayStation, playStationLabels],
  [GamepadMappingFamily.SwitchPro, switchLabels],
  [GamepadMappingFamily.JoyConLeft, joyConLeftLabels],
  [GamepadMappingFamily.JoyConRight, joyConRightLabels],
  [GamepadMappingFamily.SteamController, genericLabels],
  [GamepadMappingFamily.SteamDeck, steamDeckLabels],
  [GamepadMappingFamily.ArcadeStick, genericLabels],
]);

const mappingLabelCache = new WeakMap<GamepadMapping, ReadonlyMap<GamepadPromptControl, string>>();

/**
 * Static utility that drives in-game controller-prompt UI.
 *
 * Provides the canonical set of prompt controls, their normalised [x, y] positions
 * on a generic controller silhouette, device-family label strings (e.g. "A" for
 * Xbox, "Cross" for PlayStation, "B" for Switch), and the mapping from prompt
 * control names to {@link GamepadButton} channel values.
 */
export class GamepadPromptLayouts {
  /** Complete ordered list of every {@link GamepadPromptControl} token. */
  public static readonly controls: GamepadPromptControl[] = [
    'DPad',
    'DPadUp',
    'DPadDown',
    'DPadLeft',
    'DPadRight',
    'ButtonNorth',
    'ButtonWest',
    'ButtonEast',
    'ButtonSouth',
    'LeftShoulder',
    'RightShoulder',
    'LeftTrigger',
    'RightTrigger',
    'Select',
    'Start',
    'LeftStick',
    'RightStick',
    'Paddle1',
    'Paddle2',
    'Paddle3',
    'Paddle4',
  ];

  /**
   * Returns the normalised [x, y] position of `control` on a generic controller
   * silhouette, where (0, 0) is the top-left and (1, 1) the bottom-right.
   * Falls back to [0.5, 0.5] (centre) when the control has no registered position.
   */
  public static getControlPosition(control: GamepadPromptControl): readonly [number, number] {
    return basePositions.get(control) ?? [0.5, 0.5];
  }

  /**
   * Returns the label map for a device, e.g. `{ ButtonSouth → "A" }` for Xbox
   * or `{ ButtonSouth → "Cross" }` for PlayStation. Falls back to generic
   * labels when the family has no registered label set.
   *
   * Pass the connected pad's {@link GamepadMapping} rather than its family
   * whenever you have one: a family spans several product generations, and the
   * mapping contributes the labels that differ between them through
   * {@link GamepadMapping.promptLabels} - "Share" on a DualShock 4 where the
   * family default reads "Create". The merged map is cached per mapping.
   *
   * @example
   * ```ts
   * const labels = GamepadPromptLayouts.getControlLabels(gamepad.mapping);
   * hint.text = `Press ${labels.get('ButtonSouth')} to jump`;
   * ```
   */
  public static getControlLabels(source: GamepadMappingFamily | GamepadMapping): ReadonlyMap<GamepadPromptControl, string> {
    if (typeof source === 'string') {
      return promptLabelsByFamily.get(source) ?? genericLabels;
    }

    const familyLabels = promptLabelsByFamily.get(source.family) ?? genericLabels;

    if (source.promptLabels === undefined) {
      return familyLabels;
    }

    let labels = mappingLabelCache.get(source);

    if (labels === undefined) {
      labels = createLabels(familyLabels, [...source.promptLabels]);
      mappingLabelCache.set(source, labels);
    }

    return labels;
  }

  /**
   * Returns the static mapping from each {@link GamepadPromptControl} to its
   * corresponding {@link GamepadButton} channel. The composite `'DPad'`
   * control has no channel entry and is absent from the returned map.
   */
  public static getControlChannelMap(): ReadonlyMap<GamepadPromptControl, GamepadButtonChannel> {
    return channelMap;
  }
}
