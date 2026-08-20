/**
 * Pins the serialization contract of `InputToken`: every named control has
 * exactly one canonical token, every token round-trips, the spelling rules
 * hold, and an unknown token is rejected rather than resolved to a neighbour.
 */

import { GamepadAxis } from '#input/GamepadAxis';
import { GamepadButton } from '#input/GamepadButton';
import type { InputChannel } from '#input/InputBinding';
import { inputChannelFromToken, inputToken, inputTokens } from '#input/InputToken';
import { Pointer } from '#input/Pointer';
import { ChannelOffset, Keyboard, PointerButton } from '#input/types';

const namedChannels = (namespace: Record<string, unknown>): Array<[string, InputChannel]> =>
  Object.entries(namespace)
    .filter((entry): entry is [string, InputChannel] => typeof entry[1] === 'number')
    .map(([name, channel]) => [name, channel]);

const keyboardChannels = namedChannels(Keyboard as unknown as Record<string, unknown>).filter(([name]) => !/^\d+$/.test(name));

describe('input tokens', () => {
  test.each([
    ['Keyboard', keyboardChannels],
    ['PointerButton', namedChannels(PointerButton as unknown as Record<string, unknown>).filter(([name]) => !/^\d+$/.test(name))],
    ['Pointer', namedChannels(Pointer as unknown as Record<string, unknown>)],
    ['GamepadButton', namedChannels(GamepadButton as unknown as Record<string, unknown>)],
    ['GamepadAxis', namedChannels(GamepadAxis as unknown as Record<string, unknown>)],
  ])('every %s channel has a token that round-trips', (_namespace, channels) => {
    expect(channels.length).toBeGreaterThan(0);

    for (const [name, channel] of channels) {
      const token = inputToken(channel);

      expect(token, `${name} has no token`).toBeTruthy();
      expect(inputChannelFromToken(token), `${name} (${token}) does not round-trip`).toBe(channel);
    }
  });

  test('every token is lowercase ASCII with dot namespaces and hyphenated names', () => {
    for (const token of inputTokens()) {
      expect(token).toMatch(/^[a-z]+(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/);
    }
  });

  test('no token encodes a gamepad slot or a browser device index', () => {
    for (const token of inputTokens()) {
      if (!token.startsWith('gamepad.')) {
        continue;
      }

      expect(token).toMatch(/^gamepad\.(?:button|axis)\./);
    }
  });

  test('gamepad tokens resolve to slot-0-relative channels', () => {
    expect(inputChannelFromToken('gamepad.button.south')).toBe(GamepadButton.South);
    expect(inputChannelFromToken('gamepad.axis.left-stick-x')).toBe(GamepadAxis.LeftStickX);
  });

  test('an unknown token resolves to null instead of a neighbouring control', () => {
    expect(inputChannelFromToken('keyboard.nope')).toBeNull();
    expect(inputChannelFromToken('Keyboard.Space')).toBeNull();
    expect(inputChannelFromToken('gamepad.0.button.south')).toBeNull();
    expect(inputChannelFromToken('xbox.a')).toBeNull();
    expect(inputChannelFromToken('')).toBeNull();
  });

  test('an unnamed channel offset cannot be serialized', () => {
    // Offsets 24..31 of the button section are reserved for custom mappings
    // and carry no public name.
    expect(() => inputToken((ChannelOffset.Gamepads + 30) as InputChannel)).toThrow(/no serializable token/);
  });

  test('slot 0 pointer aliases emit the short canonical spelling', () => {
    expect(inputToken(Pointer.Slot0X)).toBe('pointer.x');
    expect(inputChannelFromToken('pointer.slot-0-x')).toBe(Pointer.X);
    expect(inputToken(Pointer.Slot1X)).toBe('pointer.slot-1-x');
  });

  test('the documented example tokens exist verbatim', () => {
    expect(inputChannelFromToken('keyboard.space')).toBe(Keyboard.Space);
    expect(inputChannelFromToken('keyboard.key-w')).toBe(Keyboard.W);
    expect(inputChannelFromToken('pointer.primary')).toBe(PointerButton.Primary);
    expect(inputChannelFromToken('pointer.secondary')).toBe(PointerButton.Secondary);
    expect(inputChannelFromToken('gamepad.button.left-shoulder')).toBe(GamepadButton.LeftShoulder);
  });
});
