/// <reference types="@webgpu/types" />

/**
 * What a persistent slot store re-uploads when it GROWS.
 *
 * A growth moves every written row into fresh GPU buffers, so those rows are
 * pending again and must be pushed. The rows ABOVE the old capacity are not:
 * they are either written by the arrivals that triggered the growth — which mark
 * their own blocks through `writeSlotFrom` — or never named by an order stream,
 * so no draw can read them. Marking them anyway costs a full-store upload on the
 * one frame a store allocates, of which up to half is rows nothing ever wrote.
 *
 * Every assertion here is on the slot count `commitDirtySlots()` reports, i.e.
 * on what actually reached `queue.writeBuffer` — not on the dirty bookkeeping
 * that produced it.
 */

import { SOURCE_QUAD_FLOATS } from '#rendering/sourceQuadRecord';
import { TRANSFORM_FLOATS_PER_ROW, TRANSFORM_TINT_BYTES_PER_ROW } from '#rendering/TransformBuffer';
import { WebGpuPersistentSlotStore } from '#rendering/webgpu/WebGpuPersistentSlotStore';

/** Mirrors the store's own module constants; a change to either must fail here loudly. */
const INITIAL_CAPACITY = 1024;
const SLOTS_PER_BLOCK = 256;

const createMockDevice = (): GPUDevice =>
  ({
    createBuffer: () => ({ destroy: () => undefined }) as unknown as GPUBuffer,
    queue: { writeBuffer: () => undefined },
  }) as unknown as GPUDevice;

/**
 * Run `body` with the `GPUBufferUsage` flags the store reads at buffer creation.
 * They are a browser global the node lane does not have.
 */
const withGpuBufferUsage = (body: () => void): void => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'GPUBufferUsage');

  Object.defineProperty(globalThis, 'GPUBufferUsage', { configurable: true, value: { STORAGE: 128, COPY_DST: 8 } });

  try {
    body();
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, 'GPUBufferUsage', previous);
    } else {
      Object.defineProperty(globalThis, 'GPUBufferUsage', { configurable: true, value: undefined });
    }
  }
};

/** A connected store, ready to grow. */
const createStore = (): WebGpuPersistentSlotStore => {
  const store = new WebGpuPersistentSlotStore();

  store.connectDevice(createMockDevice(), undefined as never);

  return store;
};

/** Write one slot from zeroed source tables — the content is irrelevant, the dirty mark is not. */
const writeSlot = (store: WebGpuPersistentSlotStore, slot: number): void => {
  store.writeSlotFrom(
    slot,
    new Float32Array(TRANSFORM_FLOATS_PER_ROW),
    0,
    new Uint8Array(TRANSFORM_TINT_BYTES_PER_ROW),
    0,
    new Float32Array(SOURCE_QUAD_FLOATS),
    0,
    0,
  );
};

describe('WebGpuPersistentSlotStore growth', () => {
  test('re-uploads the rows it carried across, and only those', () => {
    withGpuBufferUsage(() => {
      const store = createStore();

      store.ensureCapacity(1);
      writeSlot(store, 0);
      writeSlot(store, 300);

      // Two blocks touched, block granularity: 512 slots.
      expect(store.commitDirtySlots()).toBe(2 * SLOTS_PER_BLOCK);

      store.ensureCapacity(INITIAL_CAPACITY + 1);

      // The growth doubled capacity to 2048 and moved every written row into
      // fresh buffers. Exactly the 1024 carried rows are pending — not the 2048
      // the store can now hold, half of which no row has ever occupied.
      expect(store.commitDirtySlots()).toBe(INITIAL_CAPACITY);
    });
  });

  test('still uploads a slot written above the old capacity', () => {
    withGpuBufferUsage(() => {
      const store = createStore();

      store.ensureCapacity(1);
      store.commitDirtySlots();
      store.ensureCapacity(INITIAL_CAPACITY + 1);
      writeSlot(store, 1500);

      // The carried rows plus the one block holding the new arrival. Narrowing
      // the growth's dirty set must not lose a row the caller then writes.
      expect(store.commitDirtySlots()).toBe(INITIAL_CAPACITY + SLOTS_PER_BLOCK);
    });
  });

  test('uploads nothing for the first allocation until a row is written', () => {
    withGpuBufferUsage(() => {
      const store = createStore();

      store.ensureCapacity(1);

      // A store growing from zero carries no rows, so a commit before any write
      // has nothing to push. This is the bootstrap saving: at a million items the
      // first selection allocated 1 048 576 slots and uploaded all of them, 51%
      // of which had never been written and no order stream would ever name.
      expect(store.commitDirtySlots()).toBe(0);
    });
  });

  test('keeps a partially filled carried block, rounding up to the block boundary', () => {
    withGpuBufferUsage(() => {
      const store = createStore();

      // 1500 rounds up to 2048 capacity; write past a block boundary so the
      // carried range ends mid-block.
      store.ensureCapacity(1500);
      writeSlot(store, 1400);
      store.commitDirtySlots();
      store.ensureCapacity(2049);

      // 2048 carried rows is exactly 8 blocks — the boundary case where rounding
      // up must not spill into the new half.
      expect(store.commitDirtySlots()).toBe(2048);
    });
  });
});
