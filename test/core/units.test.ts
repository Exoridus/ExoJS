import { Time } from '#core/units';

describe('Time unit constructors', () => {
  test('seconds passes the value through unchanged', () => {
    expect(Time.seconds(1.5)).toBe(1.5);
    expect(Time.seconds(0)).toBe(0);
  });

  test('milliseconds passes the value through unchanged', () => {
    expect(Time.milliseconds(16)).toBe(16);
  });

  test('minutes and hours convert to seconds', () => {
    expect(Time.minutes(1)).toBe(60);
    expect(Time.minutes(0.5)).toBe(30);
    expect(Time.hours(1)).toBe(3600);
    expect(Time.hours(2)).toBe(7200);
  });

  test('toSeconds and toMilliseconds round-trip', () => {
    expect(Time.toSeconds(Time.milliseconds(1000))).toBe(1);
    expect(Time.toSeconds(Time.milliseconds(16))).toBeCloseTo(0.016, 6);
    expect(Time.toMilliseconds(Time.seconds(1))).toBe(1000);
    expect(Time.toMilliseconds(Time.toSeconds(Time.milliseconds(250)))).toBeCloseTo(250, 6);
  });

  test('a labelled value is an ordinary number at runtime', () => {
    const delta = Time.seconds(0.016);

    expect(typeof delta).toBe('number');
    expect(delta + 1).toBe(1.016);
    expect(Math.round(Time.seconds(1.6))).toBe(2);
    expect(JSON.stringify({ delta })).toBe('{"delta":0.016}');
  });
});

// The durations the engine hands out - the frame delta, the fixed step, a
// clock's elapsed total - used to be shared mutable objects, so a handler that
// wrote to one corrupted every later reader for the rest of the run. Numbers
// are values: a handler receives a copy and cannot reach the engine's own.
describe('handed-out durations cannot be mutated by the receiver', () => {
  test('a duration passed to a handler is a copy', () => {
    const engineOwned = Time.seconds(0.016);
    let received = Time.seconds(0);

    const handler = (delta: number): void => {
      received = Time.seconds(delta + 100);
    };

    handler(engineOwned);

    expect(received).toBe(100.016);
    expect(engineOwned).toBe(0.016);
  });
});
