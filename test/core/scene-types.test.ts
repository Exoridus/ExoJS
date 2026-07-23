import { Scene } from '#core/Scene';
import { DuplicateSceneRegistrationError, InvalidSceneRegistrationError, resolveSetSceneArgs, validateSceneRegistry } from '#core/SceneTypes';

describe('resolveSetSceneArgs', () => {
  test('no arguments: no data, no options', () => {
    expect(resolveSetSceneArgs([])).toEqual({ data: undefined, options: {} });
  });

  test('single plain-data argument is treated as data', () => {
    const data = { level: 3 };
    expect(resolveSetSceneArgs([data])).toEqual({ data, options: {} });
  });

  test('single options-shaped argument (transition only) is treated as options', () => {
    const options = { transition: { type: 'fade' as const } };
    expect(resolveSetSceneArgs([options])).toEqual({ data: undefined, options });
  });

  test('single options-shaped argument (retainCurrent only) is treated as options', () => {
    const options = { retainCurrent: true };
    expect(resolveSetSceneArgs([options])).toEqual({ data: undefined, options });
  });

  test('single options-shaped argument (both keys) is treated as options', () => {
    const options = { transition: { type: 'fade' as const }, retainCurrent: true };
    expect(resolveSetSceneArgs([options])).toEqual({ data: undefined, options });
  });

  test('empty object argument is treated as options (no data keys to preserve)', () => {
    expect(resolveSetSceneArgs([{}])).toEqual({ data: undefined, options: {} });
  });

  test('two arguments: data then options, unconditionally', () => {
    const data = { level: 3 };
    const options = { retainCurrent: true };
    expect(resolveSetSceneArgs([data, options])).toEqual({ data, options });
  });

  test('data containing an extra key alongside transition is treated as data (not options-shaped)', () => {
    const data = { transition: 'fade-in-game-state', level: 3 };
    expect(resolveSetSceneArgs([data])).toEqual({ data, options: {} });
  });

  test('non-object single argument (e.g. a primitive data payload) is treated as data', () => {
    expect(resolveSetSceneArgs([42])).toEqual({ data: 42, options: {} });
  });
});

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
    const registry = validateSceneRegistry({ game: { scene: OtherScene, transition: 'placeholder' } }, Scene);

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
});
