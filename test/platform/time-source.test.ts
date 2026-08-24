/**
 * The time seam at its smallest: that a clock accumulates from whatever source
 * it was given rather than from a global one. The application-level half - the
 * frame delta being measured from the adapter's frame timestamp - lives with
 * the rest of the loop timing specs.
 */

import { Clock } from '#core/Clock';
import { Time } from '#core/Time';
import { Timer } from '#core/Timer';
import type { TimeSource } from '#platform/PlatformAdapter';

/** A time source the test moves by hand. */
const createFakeTime = (): TimeSource & { advance: (ms: number) => void; set: (ms: number) => void } => {
  let value = 0;

  return {
    now: () => value,
    advance: (ms: number): void => {
      value += ms;
    },
    set: (ms: number): void => {
      value = ms;
    },
  };
};

describe('Clock time source', () => {
  it('accumulates from the source it was given, not from the host clock', () => {
    const time = createFakeTime();
    const clock = new Clock(Time.zero, false, time);

    clock.start();
    time.advance(250);

    expect(clock.elapsedMilliseconds).toBe(250);
  });

  it('holds elapsed time while stopped and continues from there on restart', () => {
    const time = createFakeTime();
    const clock = new Clock(Time.zero, false, time);

    clock.start();
    time.advance(100);
    clock.stop();

    time.advance(5_000);

    expect(clock.elapsedMilliseconds).toBe(100);

    clock.start();
    time.advance(20);

    expect(clock.elapsedMilliseconds).toBe(120);
  });

  it('zeroes on reset and starts a fresh span on restart', () => {
    const time = createFakeTime();
    const clock = new Clock(Time.zero, false, time);

    clock.start();
    time.advance(80);
    clock.reset();

    expect(clock.elapsedMilliseconds).toBe(0);
    expect(clock.running).toBe(false);

    clock.restart();
    time.advance(40);

    expect(clock.elapsedMilliseconds).toBe(40);
  });

  it('never reads the global clock once a source was supplied', () => {
    const time = createFakeTime();
    const globalNow = vi.spyOn(performance, 'now');
    const clock = new Clock(Time.zero, true, time);

    time.advance(10);
    void clock.elapsedMilliseconds;
    clock.stop();

    expect(globalNow).not.toHaveBeenCalled();

    globalNow.mockRestore();
  });

  it('reads the host clock when no source was supplied', () => {
    const globalNow = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const clock = new Clock();

    clock.start();
    globalNow.mockReturnValue(1_030);

    expect(clock.elapsedMilliseconds).toBe(30);

    globalNow.mockRestore();
  });

  it('passes a source through Timer to the clock underneath', () => {
    const time = createFakeTime();
    const timer = new Timer(new Time(50), true, time);

    time.advance(49);
    expect(timer.expired).toBe(false);

    time.advance(1);
    expect(timer.expired).toBe(true);
  });
});
