import { beforeEach, describe, expect, it } from 'vitest';

import { _resetExtensionKindsForTest, registerExtensionKind, resolveKindByPath } from '#resources/extensionKindRegistry';

describe('extensionKindRegistry', () => {
  beforeEach(() => _resetExtensionKindsForTest());

  it('resolves a bare suffix to its kind, basename-only, case-insensitive', () => {
    registerExtensionKind('png', 'texture');
    expect(resolveKindByPath('sprites/Ship.PNG')).toBe('texture');
    expect(resolveKindByPath('sprites/ship.png?v=2')).toBe('texture');
  });

  it('prefers the longest registered compound suffix', () => {
    registerExtensionKind('json', 'json');
    registerExtensionKind('atlas.json', 'texture'); // stand-in kind for the test
    expect(resolveKindByPath('ui/hero.atlas.json')).toBe('texture');
    expect(resolveKindByPath('data/config.json')).toBe('json');
  });

  it('returns undefined for an unregistered suffix', () => {
    expect(resolveKindByPath('a/b.xyz')).toBeUndefined();
  });

  it('is idempotent for the same (ext, kind)', () => {
    registerExtensionKind('png', 'texture');
    expect(() => registerExtensionKind('png', 'texture')).not.toThrow();
  });

  it('throws a loud conflict naming both kinds + the escape hatches on a clashing bare-suffix reregistration (§5.1)', () => {
    registerExtensionKind('json', 'json');
    expect(() => registerExtensionKind('json', 'texture')).toThrow(/json/);
    expect(() => registerExtensionKind('json', 'texture')).toThrow(/texture/);
    expect(() => registerExtensionKind('json', 'texture')).toThrow(/compound suffix|\.of\(\)/);
  });
});
