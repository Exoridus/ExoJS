import { AudioEffect } from '#audio/AudioEffect';

// AudioEffect is an abstract base — TS abstract-ness is compile-time only, so a
// minimal concrete subclass exercises the shared default `ready` getter without
// needing a real Web Audio effect implementation.
class MinimalEffect extends AudioEffect {
  public readonly inputNode = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
  public readonly outputNode = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
  public destroyed = false;

  public override destroy(): void {
    this.destroyed = true;
  }
}

describe('AudioEffect', () => {
  test('the default ready getter resolves immediately', async () => {
    const effect = new MinimalEffect();
    await expect(effect.ready).resolves.toBeUndefined();
  });

  test('inputNode / outputNode are exposed as provided by the subclass', () => {
    const effect = new MinimalEffect();
    expect(effect.inputNode).toBeDefined();
    expect(effect.outputNode).toBeDefined();
  });

  test('destroy() is implemented by the subclass', () => {
    const effect = new MinimalEffect();
    effect.destroy();
    expect(effect.destroyed).toBe(true);
  });
});
