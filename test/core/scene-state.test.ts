import { canDestroy, canPause, canResume, canSuspend, SceneState } from '#core/SceneState';

describe('SceneState guards', () => {
  test('canPause is true only from Active', () => {
    expect(canPause(SceneState.Active)).toBe(true);
    expect(canPause(SceneState.Preparing)).toBe(false);
    expect(canPause(SceneState.Paused)).toBe(false);
    expect(canPause(SceneState.Suspended)).toBe(false);
    expect(canPause(SceneState.Destroying)).toBe(false);
    expect(canPause(SceneState.Destroyed)).toBe(false);
  });

  test('canResume is true only from Paused', () => {
    expect(canResume(SceneState.Paused)).toBe(true);
    expect(canResume(SceneState.Active)).toBe(false);
    expect(canResume(SceneState.Preparing)).toBe(false);
    expect(canResume(SceneState.Suspended)).toBe(false);
    expect(canResume(SceneState.Destroying)).toBe(false);
    expect(canResume(SceneState.Destroyed)).toBe(false);
  });

  test('canSuspend is true from Active or Paused', () => {
    expect(canSuspend(SceneState.Active)).toBe(true);
    expect(canSuspend(SceneState.Paused)).toBe(true);
    expect(canSuspend(SceneState.Preparing)).toBe(false);
    expect(canSuspend(SceneState.Suspended)).toBe(false);
    expect(canSuspend(SceneState.Destroying)).toBe(false);
    expect(canSuspend(SceneState.Destroyed)).toBe(false);
  });

  test('canDestroy is true from every state except Destroying and Destroyed', () => {
    expect(canDestroy(SceneState.Preparing)).toBe(true);
    expect(canDestroy(SceneState.Active)).toBe(true);
    expect(canDestroy(SceneState.Paused)).toBe(true);
    expect(canDestroy(SceneState.Suspended)).toBe(true);
    expect(canDestroy(SceneState.Destroying)).toBe(false);
    expect(canDestroy(SceneState.Destroyed)).toBe(false);
  });

  test('is a string enum (never const enum) — values are readable at runtime', () => {
    expect(SceneState.Preparing).toBe('preparing');
    expect(SceneState.Active).toBe('active');
    expect(SceneState.Paused).toBe('paused');
    expect(SceneState.Suspended).toBe('suspended');
    expect(SceneState.Destroying).toBe('destroying');
    expect(SceneState.Destroyed).toBe('destroyed');
  });
});
