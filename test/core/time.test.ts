import { Time } from '#core/Time';

// Regression coverage for the shared canonical Time constants: they used to
// be plain mutable Time instances, so a mutating call on one (e.g.
// `Time.zero.add(1)`) corrupted the shared value for every other caller
// process-wide. They are now frozen — a mutating call throws instead.
describe('Time canonical constants are frozen', () => {
  const mutators: Array<[name: string, run: (time: Time) => void]> = [
    ['set()', time => time.set(5)],
    ['setMilliseconds()', time => time.setMilliseconds(5)],
    ['setSeconds()', time => time.setSeconds(5)],
    ['setMinutes()', time => time.setMinutes(5)],
    ['setHours()', time => time.setHours(5)],
    ['add()', time => time.add(5)],
    ['addTime()', time => time.addTime(new Time(5))],
    ['subtract()', time => time.subtract(5)],
    ['subtractTime()', time => time.subtractTime(new Time(5))],
    ['copy()', time => time.copy(new Time(5))],
    ['milliseconds setter', time => (time.milliseconds = 5)],
    ['seconds setter', time => (time.seconds = 5)],
    ['minutes setter', time => (time.minutes = 5)],
    ['hours setter', time => (time.hours = 5)],
  ];

  const constants: Array<[name: string, value: Time, expectedMilliseconds: number]> = [
    ['zero', Time.zero, 0],
    ['oneMillisecond', Time.oneMillisecond, 1],
    ['oneSecond', Time.oneSecond, Time.seconds],
    ['oneMinute', Time.oneMinute, Time.minutes],
    ['oneHour', Time.oneHour, Time.hours],
  ];

  test.each(constants)('%s is frozen', (_name, value) => {
    expect(Object.isFrozen(value)).toBe(true);
  });

  for (const [constantName, value, expectedMilliseconds] of constants) {
    describe(`Time.${constantName}`, () => {
      test.each(mutators)('%s throws instead of mutating the shared instance', (_mutatorName, run) => {
        expect(() => run(value)).toThrow(TypeError);

        // The shared instance itself must be provably unchanged, not merely
        // that *a* throw happened somewhere unrelated.
        expect(value.milliseconds).toBe(expectedMilliseconds);
      });
    });
  }

  test('clone() of a frozen constant returns a normal, mutable Time', () => {
    const clone = Time.zero.clone();

    expect(Object.isFrozen(clone)).toBe(false);
    expect(() => clone.add(5)).not.toThrow();
    expect(clone.milliseconds).toBe(5);
    // The source constant is untouched by mutating the clone.
    expect(Time.zero.milliseconds).toBe(0);
  });
});

// `Time.temp` was a publicly reachable static getter returning the exact
// scratch instance the frame loop hands out as `frameDelta` every frame —
// user code holding that reference could mutate the delta the engine was
// about to consume. It has been internalized entirely (moved into
// Application, which owns the frame loop) rather than kept as public API.
describe('Time.temp is no longer public API', () => {
  test('the class has no reachable `temp` member', () => {
    expect('temp' in Time).toBe(false);
    expect((Time as unknown as Record<string, unknown>)['temp']).toBeUndefined();
  });

  test('Object.keys/getOwnPropertyNames of the Time class does not list temp', () => {
    expect(Object.getOwnPropertyNames(Time)).not.toContain('temp');
  });
});
