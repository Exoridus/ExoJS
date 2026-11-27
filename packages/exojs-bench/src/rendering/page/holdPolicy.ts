import type { CellResult } from '../EngineAdapter';

/**
 * Whether a page cell keeps its scene alive for a capture.
 *
 * The page and the driver must agree on one owner: a cell that is retained is
 * released by the next `disposeHeldCell`/capture, and a cell that is not
 * retained is torn down before the page returns. An `exceeded` cell is never
 * captured, so retaining it would leave an adapter that nobody releases.
 */
export const shouldRetainHeldScene = (hold: boolean, status: CellResult['status'] | null): boolean => hold && status === 'ok';

/** Whether the page must tear its scene down before returning. */
export const shouldTeardownAfterCell = (hold: boolean, status: CellResult['status'] | null): boolean =>
  !shouldRetainHeldScene(hold, status);

/** The status a page cell reports once its measurement finished, or null when it did not. */
export const completedCellStatus = (completed: boolean, exceeded: boolean): CellResult['status'] | null => {
  if (!completed) {
    return null;
  }

  return exceeded ? 'exceeded' : 'ok';
};
