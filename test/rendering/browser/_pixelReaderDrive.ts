/**
 * Drive a backend's frame-start drain until a read settles.
 *
 * A fence or a map never settles in the task that requested it, so each step
 * yields to the event loop first and only then runs the drain the backend
 * performs at frame start. Shared by both backends' reader specs.
 */

import type { RenderBackend } from '#rendering/RenderBackend';
import type { PixelRead } from '#rendering/texture/PixelReader';

const nextTask = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** Frames a read may take before the spec gives up; generous for a software GPU. */
export const DRAIN_FRAME_BUDGET = 120;

/** Step frames until `read` is ready or failed, returning how many it took. */
export const driveUntilSettled = async (backend: RenderBackend, read: PixelRead, frames: number = DRAIN_FRAME_BUDGET): Promise<number> => {
  for (let frame = 1; frame <= frames; frame++) {
    await nextTask();
    backend.resetStats();

    if (read.ready || read.failed) {
      return frame;
    }
  }

  throw new Error(`Read did not settle within ${frames} frames.`);
};
