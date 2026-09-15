import { resolveTimingPlan } from '../src/physics/page/harness';

describe('resolveTimingPlan', () => {
  test('keeps the planned window when the clock is already cleared inside it', () => {
    // 1 ms steps against a 5 us clock: a single step spans 200 ticks.
    expect(resolveTimingPlan(1, 0.005, 120)).toEqual({ stepsPerSample: 1, timedSteps: 120 });
  });

  test('batches steps inside the window while the window can hold enough samples', () => {
    // 0.02 ms steps need 5 of them to span 20 ticks, and 120 steps hold 24 such samples.
    expect(resolveTimingPlan(0.02, 0.005, 120)).toEqual({ stepsPerSample: 5, timedSteps: 120 });
  });

  test('runs more steps rather than a coarser sample when the step is too cheap for the window', () => {
    // A 0.5 us step needs 200 of them to span 20 ticks of 5 us. The planned
    // 120 steps would cap the batch at 10 and leave every sample on one tick;
    // the plan extends the window instead.
    const plan = resolveTimingPlan(0.0005, 0.005, 120);

    expect(plan.stepsPerSample).toBe(200);
    expect(plan.timedSteps).toBe(200 * 12);
  });

  test('bounds the extension so a misjudged calibration cannot run away', () => {
    const plan = resolveTimingPlan(0.000001, 0.005, 120);

    expect(plan.timedSteps).toBeLessThanOrEqual(120 * 50);
    expect(plan.stepsPerSample * 12).toBe(plan.timedSteps);
  });

  test('times single steps when no clock resolution was observed', () => {
    expect(resolveTimingPlan(0.0005, null, 120)).toEqual({ stepsPerSample: 1, timedSteps: 120 });
  });
});
