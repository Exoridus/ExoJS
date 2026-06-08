import { Time } from '#core/Time';
import { Timer } from '#core/Timer';

describe('Timer', () => {
  test('limit getter returns the configured Time', () => {
    const limit = new Time(500);
    const timer = new Timer(limit);

    expect(timer.limit.milliseconds).toBe(500);
  });

  test('limit getter reflects updates via setter', () => {
    const initial = new Time(200);
    const timer = new Timer(initial);
    const updated = new Time(1000);

    timer.limit = updated;

    expect(timer.limit.milliseconds).toBe(1000);
  });

  test('limit getter and setter are symmetric', () => {
    const limit = new Time(750);
    const timer = new Timer(limit);

    const retrieved = timer.limit;

    expect(retrieved.milliseconds).toBe(750);
  });

  test('setting limit to zero makes the timer immediately expired', () => {
    const timer = new Timer(new Time(10000));

    expect(timer.expired).toBe(false);

    timer.limit = new Time(0);

    expect(timer.expired).toBe(true);
  });
});
