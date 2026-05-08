import { GamepadMappingFamily } from './GamepadMapping';
import { GenericDualAnalogGamepadMapping } from './GenericDualAnalogGamepadMapping';

/**
 * Mapping for Sony PlayStation controllers, covering DualShock 4 and
 * DualSense (PS4 / PS5) when connected via USB or Bluetooth.
 *
 * Inherits the full {@link GenericDualAnalogGamepadMapping} layout.
 * PlayStation-specific controls (touchpad click, Share/Create, Capture) are
 * surfaced through the Touchpad, Share, and Capture channels respectively.
 */
export class PlayStationGamepadMapping extends GenericDualAnalogGamepadMapping {
  public override readonly family = GamepadMappingFamily.PlayStation;
}
