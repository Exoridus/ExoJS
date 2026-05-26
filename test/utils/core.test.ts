describe('utils/core', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('does not touch the DOM while importing the module', async () => {
    const createElementSpy = vi.spyOn(document, 'createElement');
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    await import('@/core/utils');

    expect(createElementSpy).not.toHaveBeenCalled();
    expect(addEventListenerSpy).not.toHaveBeenCalled();
  });

  it('creates the audio element lazily when codec support is checked', async () => {
    const createElementSpy = vi.spyOn(document, 'createElement');

    const { supportsCodec } = await import('@/core/utils');

    supportsCodec('@/audio/mpeg');

    expect(createElementSpy).toHaveBeenCalledWith('audio');
  });

  it('probes passive event support lazily', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    const { supportsEventOptions } = await import('@/core/utils');

    expect(addEventListenerSpy).not.toHaveBeenCalled();
    expect(supportsEventOptions()).toBe(true);
    expect(addEventListenerSpy).toHaveBeenCalled();
  });
});
