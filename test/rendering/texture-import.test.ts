describe('@/rendering/texture/Texture import behavior', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('does not create canvases on import', async () => {
    const createElementSpy = vi.spyOn(document, 'createElement');

    await import('@/rendering/texture/Texture');

    expect(createElementSpy).not.toHaveBeenCalled();
  });

  it('creates the cached black texture lazily on first access', async () => {
    const createElementSpy = vi.spyOn(document, 'createElement');

    const { Texture } = await import('@/rendering/texture/Texture');

    expect(createElementSpy).not.toHaveBeenCalled();

    void Texture.black;

    expect(createElementSpy).toHaveBeenCalledWith('canvas');
  });
});
