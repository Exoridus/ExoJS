import { Envelope } from '@/audio/Envelope';

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

  test('release() calls cancelScheduledValues then setTargetAtTime(0)', () => {
    const env = new Envelope({ releaseMs: 300 });
    const param = makeMockAudioParam();
    const atTime = 2.0;

    env.release(param, atTime);

    expect(param.cancelScheduledValues).toHaveBeenCalledWith(atTime);
    expect(param.setTargetAtTime).toHaveBeenCalledWith(0, atTime, expect.any(Number));
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
