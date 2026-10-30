import { describe, expect, test } from 'vitest';

import { completedCellStatus, shouldRetainHeldScene, shouldTeardownAfterCell } from '../src/rendering/page/holdPolicy';

describe('held-scene ownership', () => {
  test('retains only an ok cell when capture was requested', () => {
    expect(shouldRetainHeldScene(true, 'ok')).toBe(true);
    expect(shouldTeardownAfterCell(true, 'ok')).toBe(false);
  });

  test('tears an exceeded cell down instead of retaining a scene nobody captures', () => {
    // The driver never captures an exceeded cell, so retaining it would leave an
    // adapter that is neither held for a capture nor torn down.
    expect(shouldRetainHeldScene(true, 'exceeded')).toBe(false);
    expect(shouldTeardownAfterCell(true, 'exceeded')).toBe(true);
  });

  test('tears down a cell whose measurement never completed', () => {
    expect(shouldRetainHeldScene(true, null)).toBe(false);
    expect(shouldTeardownAfterCell(true, null)).toBe(true);
  });

  test('never retains a scene when capture was not requested', () => {
    expect(shouldRetainHeldScene(false, 'ok')).toBe(false);
    expect(shouldTeardownAfterCell(false, 'ok')).toBe(true);
  });
});

describe('completedCellStatus', () => {
  test('reports nothing while the measurement has not completed', () => {
    expect(completedCellStatus(false, false)).toBeNull();
    expect(completedCellStatus(false, true)).toBeNull();
  });

  test('reports exceeded for an aborted measurement and ok otherwise', () => {
    expect(completedCellStatus(true, true)).toBe('exceeded');
    expect(completedCellStatus(true, false)).toBe('ok');
  });
});
