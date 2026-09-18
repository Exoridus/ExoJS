import type { PixelReadback } from '#rendering/PixelReadback';

/**
 * A {@link PixelReadback} whose reads land only when a test says so, through
 * `settle()`, which stands in for the backend's frame-start drain. `fail()`
 * plays the device going away under a pending read.
 */
export interface PixelReadbackDouble extends PixelReadback {
  /** Mark the oldest pending slot ready, filling its array with `fill`. Returns the slot, or -1 when nothing was pending. */
  settle(fill?: number): number;
  /** Mark every pending slot failed. */
  fail(): void;
  readonly pending: readonly number[];
  readonly destroyed: boolean;
}

export const createPixelReadbackDouble = (width: number, height: number, slots: number): PixelReadbackDouble => {
  const state: Array<'free' | 'pending' | 'ready' | 'failed'> = Array.from({ length: slots }, () => 'free');
  const data = Array.from({ length: slots }, () => new Uint8ClampedArray(width * height * 4));
  const pending: number[] = [];
  let destroyed = false;

  return {
    slots,
    pending,
    get destroyed() {
      return destroyed;
    },
    request() {
      const slot = state.indexOf('free');

      if (slot === -1 || destroyed) {
        return -1;
      }

      state[slot] = 'pending';
      pending.push(slot);

      return slot;
    },
    settle(fill = 0) {
      const slot = pending.shift();

      if (slot === undefined) {
        return -1;
      }

      data[slot]!.fill(fill);
      state[slot] = 'ready';

      return slot;
    },
    fail() {
      for (const slot of pending) {
        state[slot] = 'failed';
      }

      pending.length = 0;
    },
    isReady: slot => state[slot] === 'ready',
    isFailed: slot => state[slot] === 'failed',
    data: slot => data[slot]!,
    release(slot) {
      const index = pending.indexOf(slot);

      if (index !== -1) {
        pending.splice(index, 1);
      }

      state[slot] = 'free';
    },
    destroy() {
      destroyed = true;

      for (const slot of pending) {
        state[slot] = 'failed';
      }

      pending.length = 0;
    },
  };
};
