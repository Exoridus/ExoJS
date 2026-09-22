/**
 * A backend's half of a standing readback: a fixed ring of staging slots over
 * one rectangle of one render texture, filled without blocking and drained on
 * the frame boundary.
 *
 * `PixelReader` is the caller-facing wrapper and owns the handles; a backend
 * only sees slot indices. Every slot holds its own destination array for the
 * reader's lifetime, so a read in steady state allocates nothing.
 *
 * Slots move `free -> pending -> ready | failed -> free`. A slot is `pending`
 * from `request()` until the backend's frame-start drain finds its copy
 * landed, never within the task that requested it. `release()` is the only way
 * back to `free`, whichever state the slot is in.
 * @advanced
 */
export interface PixelReadback {
  /** Number of staging slots, fixed at creation. */
  readonly slots: number;

  /**
   * Copy the bound rectangle into a free slot and return its index, or `-1`
   * when every slot is still held. Pending draws into the source are submitted
   * first. While the device is lost the slot is claimed and fails at once,
   * so a caller sees `failed` rather than a refusal it would misread as
   * pressure.
   */
  request(): number;

  /** Whether the slot's rows have landed in its array. */
  isReady(slot: number): boolean;

  /** Whether the slot's read cannot complete: device lost, released early, or destroyed under it. Terminal until released. */
  isFailed(slot: number): boolean;

  /** The slot's destination array: RGBA bytes, top row first. Valid content only while `isReady`. */
  data(slot: number): Uint8ClampedArray;

  /** Return the slot to the ring. A pending read is abandoned; its bytes are discarded when they land. */
  release(slot: number): void;

  /** Release every slot's GPU object and detach from the backend. Pending reads fail. Idempotent. */
  destroy(): void;
}
