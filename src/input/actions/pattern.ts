import type { InputChannel } from '#input/InputBinding';
import { Keyboard, resolveGamepadSlotChannel } from '#input/types';

export type InputChord = readonly InputChannel[];
export type InputSequence = ReadonlyArray<InputChannel | InputChord>;

const keyboardByName = new Map<string, number>(
  Object.entries(Keyboard)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .map(([name, value]) => [name.toLowerCase(), value]),
);

function resolveToken(token: string): number {
  const normalized = token
    .trim()
    .replace(/^Keyboard\./i, '')
    .toLowerCase();
  const channel = keyboardByName.get(normalized);

  if (channel === undefined) {
    throw new Error(`Input pattern: unknown keyboard token "${token.trim()}". ` + 'Use a Keyboard enum name or pass numeric channels.');
  }

  return channel;
}

export function normalizeSequence(input: string | InputSequence, gamepadSlot: 0 | 1 | 2 | 3): ReadonlyArray<readonly number[]> {
  const steps: ReadonlyArray<InputChannel | InputChord> =
    typeof input === 'string'
      ? input
          .trim()
          .split('>')
          .map((step, index) => {
            const tokens = step.split('+').map(token => token.trim());

            if (tokens.some(token => token.length === 0)) {
              throw new Error(`Input pattern: sequence step ${index + 1} contains an empty chord token.`);
            }

            return tokens.map(resolveToken);
          })
      : input;

  if (steps.length === 0) {
    throw new Error('Input sequence must contain at least one step.');
  }

  return steps.map((step, index) => {
    const channels: readonly InputChannel[] = Array.isArray(step) ? step : [step as InputChannel];
    if (channels.length === 0) {
      throw new Error(`Input pattern: sequence step ${index + 1} is empty.`);
    }

    const resolved = channels.map(channel => resolveGamepadSlotChannel(channel, gamepadSlot));

    if (new Set(resolved).size !== resolved.length) {
      throw new Error(`Input pattern: sequence step ${index + 1} contains the same channel more than once.`);
    }

    return resolved;
  });
}
