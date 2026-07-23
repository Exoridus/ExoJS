import { canDestroy, canRestore, canSuspend, SceneState } from '#core/SceneState';

describe('SceneState guards', () => {
  test('canSuspend is true only from Active', () => {
    expect(canSuspend(SceneState.Active)).toBe(true);
    expect(canSuspend(SceneState.Preparing)).toBe(false);
    expect(canSuspend(SceneState.Suspended)).toBe(false);
    expect(canSuspend(SceneState.Destroying)).toBe(false);
    expect(canSuspend(SceneState.Destroyed)).toBe(false);
  });

  test('canSuspend is false for Ready — a scope that never activated has nothing live to suspend', () => {
    expect(canSuspend(SceneState.Ready)).toBe(false);
  });

  test('canRestore is false for Ready', () => {
    expect(canRestore(SceneState.Ready)).toBe(false);
  });

  test('canDestroy is true for Ready', () => {
    expect(canDestroy(SceneState.Ready)).toBe(true);
  });

  test('canDestroy is true from every state except Destroying and Destroyed', () => {
    expect(canDestroy(SceneState.Preparing)).toBe(true);
    expect(canDestroy(SceneState.Active)).toBe(true);
    expect(canDestroy(SceneState.Suspended)).toBe(true);
    expect(canDestroy(SceneState.Destroying)).toBe(false);
    expect(canDestroy(SceneState.Destroyed)).toBe(false);
  });

  test('canRestore is true only from Suspended', () => {
    expect(canRestore(SceneState.Suspended)).toBe(true);
    expect(canRestore(SceneState.Active)).toBe(false);
    expect(canRestore(SceneState.Preparing)).toBe(false);
    expect(canRestore(SceneState.Destroying)).toBe(false);
    expect(canRestore(SceneState.Destroyed)).toBe(false);
  });

  test('is a string enum (never const enum) — values are readable at runtime', () => {
    expect(SceneState.Preparing).toBe('preparing');
    expect(SceneState.Ready).toBe('ready');
    expect(SceneState.Active).toBe('active');
    expect(SceneState.Suspended).toBe('suspended');
    expect(SceneState.Destroying).toBe('destroying');
    expect(SceneState.Destroyed).toBe('destroyed');
  });
});
