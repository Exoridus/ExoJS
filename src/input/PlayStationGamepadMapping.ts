import { GamepadButton } from './GamepadButton';
import { GamepadMappingFamily } from './GamepadMapping';
import type { GamepadPromptControl } from './GamepadPromptLayouts';
import { GenericDualAnalogGamepadMapping } from './GenericDualAnalogGamepadMapping';

/**
 * Console generation a {@link PlayStationGamepadMapping} targets.
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

const generationLabels = new Map<PlayStationGeneration, ReadonlyMap<GamepadPromptControl, string>>([
  [
    PlayStationGeneration.PS3,
    new Map<GamepadPromptControl, string>([
      ['Select', 'Select'],
      ['Start', 'Start'],
    ]),
  ],
  [PlayStationGeneration.PS4, new Map<GamepadPromptControl, string>([['Select', 'Share']])],
]);

// DUALSHOCK_BUTTON_TOUCHPAD == DUAL_SENSE_BUTTON_TOUCHPAD == 17; a PS3 pad
// stops at the standard index 16 and gets no entry.
const createExtraButtons = (generation: PlayStationGeneration): GamepadButton[] =>
  generation === PlayStationGeneration.PS3 ? [] : [new GamepadButton(17, GamepadButton.Touchpad)];

/**
 * Mapping for Sony PlayStation controllers, covering DualShock 3, DualShock 4
 * and DualSense (PS3 / PS4 / PS5) when connected via USB or Bluetooth.
 *
 * Inherits the full {@link GenericDualAnalogGamepadMapping} layout. On PS4 and
 * PS5 pads it claims the one device-specific slot at index 17 for the touchpad
 * **click**; a PS3 pad has no touchpad and stops at the standard index 16.
 * Select/Share/Create sits on the standard Select slot (index 8) on all three,
 * so it needs no entry of its own — but it is printed differently on each,
 * which is what {@link GamepadMapping.promptLabels} carries here.
 *
 * Touchpad *coordinates* are not available: browsers model the touchpad as a
 * button, and the standard axis set stops after the two sticks. Reading finger
 * positions requires WebHID and a custom `GamepadDefinition`.
 *
 * @param generation - Console generation of the physical pad. Defaults to
 * {@link PlayStationGeneration.PS5}, the layout an unrecognised Sony device is
 * most likely to have.
 */
export class PlayStationGamepadMapping extends GenericDualAnalogGamepadMapping {
  public override readonly family = GamepadMappingFamily.PlayStation;

  /** Console generation this instance was built for. */
  public readonly generation: PlayStationGeneration;

  public constructor(generation: PlayStationGeneration = PlayStationGeneration.PS5) {
    super(createExtraButtons(generation), generationLabels.get(generation));

    this.generation = generation;
  }
}
