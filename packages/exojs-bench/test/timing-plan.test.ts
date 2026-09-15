import { resolveSampleResolution, resolveTimingPlan } from '../src/physics/page/harness';

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

describe('resolveTimingPlan with a zero calibration estimate', () => {
  test('extends the window to the cap instead of sampling the planned window coarsely', () => {
    const plan = resolveTimingPlan(0, 0.005, 120);

    expect(plan.stepsPerSample).toBe(Math.floor((120 * 50) / 12));
    expect(plan.timedSteps).toBe(plan.stepsPerSample * 12);
  });

  test('never plans an empty window for a tiny step count', () => {
    const plan = resolveTimingPlan(0, 0.005, 1);

    expect(plan.stepsPerSample).toBeGreaterThanOrEqual(1);
    expect(plan.timedSteps).toBeGreaterThanOrEqual(1);
  });
});

describe('resolveSampleResolution', () => {
  test('marks a median under four clock ticks as unresolved', () => {
    // 0.0005 ms per step, 10 steps per sample, 5 us clock: one tick per sample.
    expect(resolveSampleResolution(0.0005, 10, 0.005)).toEqual({ achievedTicks: 1, unresolved: true });
  });

  test('accepts a median at the floor', () => {
    expect(resolveSampleResolution(0.002, 10, 0.005)).toEqual({ achievedTicks: 4, unresolved: false });
  });

  test('leaves a median unqualified when the clock was never observed', () => {
    expect(resolveSampleResolution(0, 1, null)).toEqual({ achievedTicks: null, unresolved: false });
  });
});
