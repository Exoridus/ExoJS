// @vitest-environment node
import { expect, it } from 'vitest';

import { deriveCapabilities } from '../../scripts/lib/example-capabilities';

it('keeps keyboard-backed controller bindings optional', () => {
  expect(deriveCapabilities('GamepadAxis.LeftX; Keyboard.Space;', 'action-mapping', 'input')).not.toContain('gamepad');
  expect(deriveCapabilities('GamepadButton.South; Keyboard.Space;', 'gamepad-spaceship', 'showcase')).not.toContain('gamepad');
});

it('retains the dedicated controller tool requirement', () => {
  expect(deriveCapabilities('GamepadButton.South;', 'gamepad', 'input')).toContain('gamepad');
});

it('keeps pointer gestures accessible without touch hardware', () => {
  const capabilities = deriveCapabilities('onPointerDown; onPinch; onRotate;', 'multitouch', 'input');
  expect(capabilities).toContain('pointer');
  expect(capabilities).not.toContain('touch');
});
