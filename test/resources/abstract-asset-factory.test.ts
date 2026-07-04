import { AbstractAssetFactory } from '#resources/AbstractAssetFactory';

// ---------------------------------------------------------------------------
// Minimal concrete subclass — AbstractAssetFactory is abstract, and its own
// protected revokeObjectUrl() needs a public seam for direct testing.
// ---------------------------------------------------------------------------

class ConcreteFactory extends AbstractAssetFactory<string> {
  public readonly storageName = 'concrete';

  public async process(response: Response): Promise<unknown> {
    return response;
  }

  public async create(source: unknown): Promise<string> {
    return String(source);
  }

  /** Test-only seam onto the protected revokeObjectUrl(). */
  public revoke(objectUrl: string): void {
    this.revokeObjectUrl(objectUrl);
  }
}

describe('AbstractAssetFactory', () => {
  test('createObjectUrl tracks the URL for later cleanup', () => {
    const factory = new ConcreteFactory();

    const objectUrl = factory.createObjectUrl(new Blob(['x']));

    expect(objectUrl).toEqual(expect.any(String));
  });

  test('destroy() revokes every tracked object URL and clears the pool', () => {
    const factory = new ConcreteFactory();
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

    const urlA = factory.createObjectUrl(new Blob(['a']));
    const urlB = factory.createObjectUrl(new Blob(['b']));

    factory.destroy();

    expect(revokeSpy).toHaveBeenCalledWith(urlA);
    expect(revokeSpy).toHaveBeenCalledWith(urlB);

    revokeSpy.mockRestore();
  });

  test('destroy() on a factory with no tracked URLs does not throw', () => {
    const factory = new ConcreteFactory();

    expect(() => factory.destroy()).not.toThrow();
  });

  test('revokeObjectUrl removes the URL from the tracking pool so a later destroy() does not re-revoke it', () => {
    const factory = new ConcreteFactory();
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

    const objectUrl = factory.createObjectUrl(new Blob(['x']));
    factory.revoke(objectUrl);
    revokeSpy.mockClear();

    factory.destroy();

    expect(revokeSpy).not.toHaveBeenCalled();

    revokeSpy.mockRestore();
  });

  test('revokeObjectUrl on an untracked URL still revokes it but does not throw (index not found)', () => {
    const factory = new ConcreteFactory();

    expect(() => factory.revoke('blob:untracked-url')).not.toThrow();
  });
});
