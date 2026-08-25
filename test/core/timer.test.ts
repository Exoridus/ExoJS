import { Timer } from '#core/Timer';
import { Time } from '#core/units';

describe('Timer', () => {
  test('limit getter returns the configured Time', () => {
    const limit = Time.toSeconds(Time.milliseconds(500));
    const timer = new Timer(limit);

    expect(timer.limit * 1000).toBe(500);
  });

  test('limit getter reflects updates via setter', () => {
    const initial = Time.toSeconds(Time.milliseconds(200));
    const timer = new Timer(initial);
    const updated = Time.toSeconds(Time.milliseconds(1000));

    timer.limit = updated;

    expect(timer.limit * 1000).toBe(1000);
  });

  test('limit getter and setter are symmetric', () => {
    const limit = Time.toSeconds(Time.milliseconds(750));
    const timer = new Timer(limit);

    const retrieved = timer.limit;

    expect(retrieved * 1000).toBe(750);
  });

  test('setting limit to zero makes the timer immediately expired', () => {
    const timer = new Timer(Time.toSeconds(Time.milliseconds(10000)));

    expect(timer.expired).toBe(false);

    timer.limit = Time.toSeconds(Time.milliseconds(0));

    expect(timer.expired).toBe(true);
  });
});
