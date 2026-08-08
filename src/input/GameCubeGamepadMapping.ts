import { GamepadMappingFamily } from './GamepadMapping';
import { GenericDualAnalogGamepadMapping } from './GenericDualAnalogGamepadMapping';

/**
 * Mapping for Nintendo GameCube controllers (typically connected via a
 * USB adapter such as the official Nintendo adapter for Wii U / Switch).
 *
 * Inherits the full {@link GenericDualAnalogGamepadMapping} button and axis
 * layout unchanged; `family` is the only distinguishing factor from the
 * generic mapping. The real GameCube controller's channel availability
 * (e.g. right-stick click, D-pad as discrete buttons, digital vs. analog
 * shoulders) differs by adapter and is not modeled here — treat
 * {@link GenericDualAnalogGamepadMapping.hasChannel} results for this
 * mapping as the generic dual-analog layout, not a verified
 * GameCube-accurate one.
 */
export class GameCubeGamepadMapping extends GenericDualAnalogGamepadMapping {
  public override readonly family = GamepadMappingFamily.GameCube;
}
