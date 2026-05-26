import { registerAudioWorkletProcessor } from '@/audio/worklet/registerWorklet';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeContext = () => {
  const addModule = vi.fn().mockResolvedValue(undefined);
  const ctx = {
    audioWorklet: { addModule },
  } as unknown as BaseAudioContext;
  return { ctx, addModule };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerAudioWorkletProcessor', () => {
  let createObjectURL: MockInstance;
  let revokeObjectURL: MockInstance;

  beforeEach(() => {
    // Ensure fresh URL mocks per test
    createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    revokeObjectURL = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('first call resolves and calls addModule once', async () => {
    const { ctx, addModule } = makeContext();
    await registerAudioWorkletProcessor(ctx, 'proc-a', '/* source */');
    expect(addModule).toHaveBeenCalledTimes(1);
  });

  it('second call with same context+name is a no-op (addModule not called again)', async () => {
    const { ctx, addModule } = makeContext();
    await registerAudioWorkletProcessor(ctx, 'proc-b', '/* source */');
    await registerAudioWorkletProcessor(ctx, 'proc-b', '/* source */');
    expect(addModule).toHaveBeenCalledTimes(1);
  });

  it('concurrent calls share the same in-flight Promise (only one addModule)', async () => {
    const { ctx, addModule } = makeContext();
    const [p1, p2, p3] = [
      registerAudioWorkletProcessor(ctx, 'proc-c', '/* source */'),
      registerAudioWorkletProcessor(ctx, 'proc-c', '/* source */'),
      registerAudioWorkletProcessor(ctx, 'proc-c', '/* source */'),
    ];
    await Promise.all([p1, p2, p3]);
    expect(addModule).toHaveBeenCalledTimes(1);
  });

  it('different processor names are independent', async () => {
    const { ctx, addModule } = makeContext();
    await registerAudioWorkletProcessor(ctx, 'proc-x', '/* source */');
    await registerAudioWorkletProcessor(ctx, 'proc-y', '/* source */');
    expect(addModule).toHaveBeenCalledTimes(2);
  });

  it('different contexts are independent', async () => {
    const { ctx: ctx1, addModule: addModule1 } = makeContext();
    const { ctx: ctx2, addModule: addModule2 } = makeContext();
    await registerAudioWorkletProcessor(ctx1, 'proc-shared', '/* source */');
    await registerAudioWorkletProcessor(ctx2, 'proc-shared', '/* source */');
    expect(addModule1).toHaveBeenCalledTimes(1);
    expect(addModule2).toHaveBeenCalledTimes(1);
  });

  it('failed registration clears the pending entry so retries can attempt again', async () => {
    const { ctx, addModule } = makeContext();
    addModule.mockRejectedValueOnce(new Error('load failed')).mockResolvedValueOnce(undefined);

    await expect(registerAudioWorkletProcessor(ctx, 'proc-fail', '/* source */')).rejects.toThrow('load failed');
    // After failure, pending is cleared — retry should succeed
    await expect(registerAudioWorkletProcessor(ctx, 'proc-fail', '/* source */')).resolves.toBeUndefined();
    expect(addModule).toHaveBeenCalledTimes(2);
  });

  it('creates a Blob URL and revokes it after addModule resolves', async () => {
    const { ctx } = makeContext();
    await registerAudioWorkletProcessor(ctx, 'proc-blob', '/* source */');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('revokes the Blob URL even when addModule rejects', async () => {
    const { ctx, addModule } = makeContext();
    addModule.mockRejectedValueOnce(new Error('fail'));
    await expect(registerAudioWorkletProcessor(ctx, 'proc-revoke', '/* source */')).rejects.toThrow();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('after successful registration, third call is also a no-op', async () => {
    const { ctx, addModule } = makeContext();
    await registerAudioWorkletProcessor(ctx, 'proc-triple', '/* source */');
    await registerAudioWorkletProcessor(ctx, 'proc-triple', '/* source */');
    await registerAudioWorkletProcessor(ctx, 'proc-triple', '/* source */');
    expect(addModule).toHaveBeenCalledTimes(1);
  });
});
