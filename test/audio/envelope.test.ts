import type { Mocked } from 'vitest';

import { Envelope } from '#audio/Envelope';

const makeMockAudioParam = (): Mocked<AudioParam> =>
  ({
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setValueCurveAtTime: vi.fn(),
    cancelAndHoldAtTime: vi.fn(),
    value: 0,
    automationRate: 'a-rate',
    defaultValue: 0,
    maxValue: 3.4028234663852886e38,
    minValue: -3.4028234663852886e38,
  }) as unknown as Mocked<AudioParam>;

/**
 * An `AudioParam` from a browser that does not implement
 * `cancelAndHoldAtTime` — Firefox to this day.
 */
const makeLegacyAudioParam = (): Mocked<AudioParam> => {
  const param = makeMockAudioParam() as unknown as Record<string, unknown>;
  delete param.cancelAndHoldAtTime;
  return param as unknown as Mocked<AudioParam>;
};

describe('Envelope', () => {
  test('default values match spec', () => {
    const env = new Envelope();

    expect(env.attackMs).toBe(10);
    expect(env.decayMs).toBe(100);
    expect(env.sustainLevel).toBe(0.7);
    expect(env.releaseMs).toBe(200);
  });

  test('construction with custom options', () => {
    const env = new Envelope({ attackMs: 50, decayMs: 200, sustainLevel: 0.5, releaseMs: 400 });

    expect(env.attackMs).toBe(50);
    expect(env.decayMs).toBe(200);
    expect(env.sustainLevel).toBe(0.5);
    expect(env.releaseMs).toBe(400);
  });

  test('clamps negative attackMs to 0', () => {
    const env = new Envelope({ attackMs: -10 });
    expect(env.attackMs).toBe(0);
  });

  test('clamps negative decayMs to 0', () => {
    const env = new Envelope({ decayMs: -50 });
    expect(env.decayMs).toBe(0);
  });

  test('clamps negative releaseMs to 0', () => {
    const env = new Envelope({ releaseMs: -100 });
    expect(env.releaseMs).toBe(0);
  });

  test('clamps sustainLevel > 1 to 1', () => {
    const env = new Envelope({ sustainLevel: 2 });
    expect(env.sustainLevel).toBe(1);
  });

  test('clamps sustainLevel < 0 to 0', () => {
    const env = new Envelope({ sustainLevel: -0.5 });
    expect(env.sustainLevel).toBe(0);
  });

  test('trigger() calls cancelScheduledValues, setValueAtTime(0), then linearRamps', () => {
    const env = new Envelope({ attackMs: 10, decayMs: 100, sustainLevel: 0.7 });
    const param = makeMockAudioParam();
    const atTime = 1.0;

    env.trigger(param, atTime);

    const attackEnd = atTime + 10 / 1000;
    const decayEnd = attackEnd + 100 / 1000;

    expect(param.cancelScheduledValues).toHaveBeenCalledWith(atTime);
    expect(param.setValueAtTime).toHaveBeenCalledWith(0, atTime);
    expect(param.linearRampToValueAtTime).toHaveBeenCalledWith(1.0, attackEnd);
    expect(param.linearRampToValueAtTime).toHaveBeenCalledWith(0.7, decayEnd);
  });

  test('trigger() schedules in the correct order', () => {
    const env = new Envelope({ attackMs: 20, decayMs: 80, sustainLevel: 0.5 });
    const param = makeMockAudioParam();
    const callOrder: string[] = [];

    param.cancelScheduledValues.mockImplementation(() => {
      callOrder.push('cancel');
      return param;
    });
    param.setValueAtTime.mockImplementation(() => {
      callOrder.push('setValue');
      return param;
    });
    param.linearRampToValueAtTime.mockImplementation(() => {
      callOrder.push('ramp');
      return param;
    });

    env.trigger(param, 0);

    expect(callOrder).toEqual(['cancel', 'setValue', 'ramp', 'ramp']);
  });

  test('release() holds the running value via cancelAndHoldAtTime, then ramps to 0', () => {
    const env = new Envelope({ releaseMs: 300 });
    const param = makeMockAudioParam();
    const atTime = 2.0;

    env.release(param, atTime);

    expect(param.cancelAndHoldAtTime).toHaveBeenCalledWith(atTime);
    // cancelScheduledValues would discard the in-flight ramp and snap the param
    // back to the previous event's value — an audible click mid-attack.
    expect(param.cancelScheduledValues).not.toHaveBeenCalled();
    expect(param.setTargetAtTime).toHaveBeenCalledWith(0, atTime, expect.any(Number));
  });

  // Firefox still ships no cancelAndHoldAtTime, so the analytical fallback is
  // the path that actually runs there — not an optional extra.
  describe('release() without cancelAndHoldAtTime (browser fallback)', () => {
    test('releasing mid-attack holds the interpolated attack value', () => {
      const env = new Envelope({ attackMs: 100, decayMs: 100, sustainLevel: 0.5 });
      const param = makeLegacyAudioParam();

      env.trigger(param, 0);
      env.release(param, 0.05); // halfway through the 100ms attack

      expect(param.cancelScheduledValues).toHaveBeenCalledWith(0.05);
      expect(param.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(0.5, 6), 0.05);
      expect(param.setTargetAtTime).toHaveBeenCalledWith(0, 0.05, expect.any(Number));
    });

    test('releasing mid-decay holds the interpolated decay value', () => {
      const env = new Envelope({ attackMs: 100, decayMs: 100, sustainLevel: 0.5 });
      const param = makeLegacyAudioParam();

      env.trigger(param, 0);
      env.release(param, 0.15); // halfway through the decay: 1 -> 0.5

      expect(param.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(0.75, 6), 0.15);
    });

    test('releasing during sustain holds the sustain level', () => {
      const env = new Envelope({ attackMs: 100, decayMs: 100, sustainLevel: 0.5 });
      const param = makeLegacyAudioParam();

      env.trigger(param, 0);
      env.release(param, 1);

      expect(param.setValueAtTime).toHaveBeenCalledWith(0.5, 1);
    });

    test('releasing an envelope that was never triggered holds the live param value', () => {
      const env = new Envelope({ attackMs: 100, decayMs: 100, sustainLevel: 0.5 });
      const param = makeLegacyAudioParam();
      param.value = 0.3;

      env.release(param, 1);

      expect(param.setValueAtTime).toHaveBeenCalledWith(0.3, 1);
    });

    test('a zero-length attack and decay hold the sustain level immediately', () => {
      const env = new Envelope({ attackMs: 0, decayMs: 0, sustainLevel: 0.4 });
      const param = makeLegacyAudioParam();

      env.trigger(param, 0);
      env.release(param, 0);

      expect(param.setValueAtTime).toHaveBeenCalledWith(0.4, 0);
    });
  });

  // `elapsedMs` is what lets a voice resume a partially-elapsed envelope after
  // a pause instead of restarting it or finding it already run out.
  describe('trigger() with elapsedMs (resuming a partially-elapsed envelope)', () => {
    test('mid-attack: pins the interpolated value and shortens the remaining attack', () => {
      const env = new Envelope({ attackMs: 100, decayMs: 100, sustainLevel: 0.25 });
      const param = makeMockAudioParam();

      env.trigger(param, 5, 50);

      expect(param.cancelScheduledValues).toHaveBeenCalledWith(5);
      expect(param.setValueAtTime).toHaveBeenCalledWith(0.5, 5);
      expect(param.linearRampToValueAtTime).toHaveBeenCalledWith(1, expect.closeTo(5.05, 9));
      expect(param.linearRampToValueAtTime).toHaveBeenCalledWith(0.25, expect.closeTo(5.15, 9));
    });

    test('mid-decay: pins the interpolated value and schedules only the rest of the decay', () => {
      const env = new Envelope({ attackMs: 100, decayMs: 200, sustainLevel: 0.4 });
      const param = makeMockAudioParam();

      env.trigger(param, 3, 200);

      expect(param.setValueAtTime).toHaveBeenCalledWith(0.7, 3);
      expect(param.linearRampToValueAtTime).toHaveBeenCalledTimes(1);
      expect(param.linearRampToValueAtTime).toHaveBeenCalledWith(0.4, 3.1);
    });

    test('past decay: pins the sustain level and schedules nothing', () => {
      const env = new Envelope({ attackMs: 10, decayMs: 100, sustainLevel: 0.6 });
      const param = makeMockAudioParam();

      env.trigger(param, 2, 5000);

      expect(param.setValueAtTime).toHaveBeenCalledWith(0.6, 2);
      expect(param.linearRampToValueAtTime).not.toHaveBeenCalled();
    });

    test('a resumed envelope releases from its shifted trigger point, not from the resume time', () => {
      const env = new Envelope({ attackMs: 100, decayMs: 100, sustainLevel: 0.25, releaseMs: 300 });
      const param = makeLegacyAudioParam();

      env.trigger(param, 5, 50);
      // 25 ms further into the attack: 75 / 100.
      env.release(param, 5.025);

      expect(param.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(0.75, 9), 5.025);
    });
  });

  describe('hold()', () => {
    test('freezes the automation at the running value via cancelAndHoldAtTime', () => {
      const env = new Envelope({ attackMs: 100, decayMs: 100 });
      const param = makeMockAudioParam();

      env.trigger(param, 0);
      env.hold(param, 0.05);

      expect(param.cancelAndHoldAtTime).toHaveBeenCalledWith(0.05);
      // A hold is not a release - nothing ramps to zero.
      expect(param.setTargetAtTime).not.toHaveBeenCalled();
    });

    test('without cancelAndHoldAtTime, pins the reconstructed value instead', () => {
      const env = new Envelope({ attackMs: 100, decayMs: 100, sustainLevel: 0.25 });
      const param = makeLegacyAudioParam();

      env.trigger(param, 0);
      env.hold(param, 0.05);

      expect(param.cancelScheduledValues).toHaveBeenCalledWith(0.05);
      expect(param.setValueAtTime).toHaveBeenCalledWith(0.5, 0.05);
    });

    test('keeps the trigger bookkeeping, so a later release still reconstructs the envelope', () => {
      const env = new Envelope({ attackMs: 100, decayMs: 100, sustainLevel: 0.25 });
      const param = makeLegacyAudioParam();

      env.trigger(param, 0);
      env.hold(param, 0.05);
      param.setValueAtTime.mockClear();
      env.release(param, 0.05);

      // Reconstructed from the envelope geometry (0.5), not from the param's
      // untouched mock `value` (0).
      expect(param.setValueAtTime).toHaveBeenCalledWith(0.5, 0.05);
    });
  });

  test('release() uses tau = releaseMs / 3 / 1000', () => {
    const env = new Envelope({ releaseMs: 300 });
    const param = makeMockAudioParam();

    env.release(param, 0);

    const tau = 300 / 1000 / 3; // 0.1
    expect(param.setTargetAtTime).toHaveBeenCalledWith(0, 0, tau);
  });

  test('totalDurationMs returns sum of attack + decay + release', () => {
    const env = new Envelope({ attackMs: 50, decayMs: 150, sustainLevel: 0.8, releaseMs: 300 });
    expect(env.totalDurationMs).toBe(500);
  });

  test('totalDurationMs with default values', () => {
    const env = new Envelope();
    expect(env.totalDurationMs).toBe(10 + 100 + 200);
  });

  test('destroy() does not throw', () => {
    const env = new Envelope();
    expect(() => env.destroy()).not.toThrow();
  });

  test('destroy() is a no-op (can be called multiple times)', () => {
    const env = new Envelope();
    expect(() => {
      env.destroy();
      env.destroy();
    }).not.toThrow();
  });
});
