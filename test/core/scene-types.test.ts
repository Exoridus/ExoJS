import { resolveSetSceneArgs } from '#core/SceneTypes';

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
