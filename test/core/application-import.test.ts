describe('@/core/Application import behavior', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('does not create a canvas on import', async () => {
    const createElementSpy = vi.spyOn(document, 'createElement');

    await import('@/core/Application');

    expect(createElementSpy).not.toHaveBeenCalled();
  });
});
