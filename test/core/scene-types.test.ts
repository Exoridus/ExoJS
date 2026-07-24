import { Scene } from '#core/Scene';
import { DuplicateSceneRegistrationError, InvalidSceneRegistrationError, validateSceneRegistry } from '#core/SceneTypes';

// The erased-at-runtime (data?, options?) variadic heuristic
// (resolveSetSceneArgs/SetSceneArgs) was deleted in Slice 3 — change()/
// restore() now take a single options object, so there is nothing left to
// disambiguate at runtime. This file's dedicated resolveSetSceneArgs
// coverage was deleted along with it (not renamed — there is no successor
// function).

describe('validateSceneRegistry', () => {
  class VoidScene extends Scene {}
  class OtherScene extends Scene {}

  test('undefined input returns empty byConstructor/byKey maps', () => {
    const registry = validateSceneRegistry(undefined, Scene);

    expect(registry.byConstructor.size).toBe(0);
    expect(registry.byKey.size).toBe(0);
  });

  test('a bare-constructor entry populates both directions', () => {
    const registry = validateSceneRegistry({ title: VoidScene }, Scene);

    expect(registry.byConstructor.get(VoidScene)).toBe('title');
    expect(registry.byKey.get('title')).toBe(VoidScene);
  });

  test('a descriptor-form entry resolves to its scene constructor in both directions', () => {
    const registry = validateSceneRegistry({ game: { scene: OtherScene, transition: false } }, Scene);

    expect(registry.byConstructor.get(OtherScene)).toBe('game');
    expect(registry.byKey.get('game')).toBe(OtherScene);
  });

  test('bare and descriptor forms coexist in one registry', () => {
    const registry = validateSceneRegistry({ title: VoidScene, game: { scene: OtherScene } }, Scene);

    expect(registry.byKey.size).toBe(2);
    expect(registry.byConstructor.size).toBe(2);
  });

  test('rejects a duplicate constructor registered under two keys, even across mixed forms', () => {
    expect(() => validateSceneRegistry({ first: VoidScene, second: { scene: VoidScene } }, Scene)).toThrow(DuplicateSceneRegistrationError);
  });

  test('rejects a descriptor whose scene is not a Scene subclass', () => {
    class NotAScene {}

    expect(() => validateSceneRegistry({ bad: { scene: NotAScene as never } }, Scene)).toThrow(InvalidSceneRegistrationError);
  });

  test('rejects a value that is neither a constructor nor a { scene } descriptor', () => {
    expect(() => validateSceneRegistry({ bad: {} as never }, Scene)).toThrow(InvalidSceneRegistrationError);
  });

  describe('defaultTransitions (spec §3.10)', () => {
    test('a descriptor with a transition populates defaultTransitions for its resolved constructor', () => {
      const registeredTransition = false as const;
      const registry = validateSceneRegistry({ game: { scene: OtherScene, transition: registeredTransition } }, Scene);

      expect(registry.defaultTransitions.get(OtherScene)).toBe(registeredTransition);
    });

    test('a bare-constructor entry has no defaultTransitions entry', () => {
      const registry = validateSceneRegistry({ title: VoidScene }, Scene);

      expect(registry.defaultTransitions.has(VoidScene)).toBe(false);
    });

    test('a descriptor with no transition field has no defaultTransitions entry', () => {
      const registry = validateSceneRegistry({ game: { scene: OtherScene } }, Scene);

      expect(registry.defaultTransitions.has(OtherScene)).toBe(false);
    });

    test('undefined input returns an empty defaultTransitions map', () => {
      const registry = validateSceneRegistry(undefined, Scene);

      expect(registry.defaultTransitions.size).toBe(0);
    });
  });
});
