/// <reference types="@webgpu/types" />

/**
 * Whether a persistent slot store admits that a selection is too big for the
 * DEVICE it is connected to.
 *
 * The store's four per-slot buffers are `storage` bindings, so each one is
 * bounded by `min(maxBufferSize, maxStorageBufferBindingSize)` of the GRANTED
 * device limits — not the adapter's. A device requested without `requiredLimits`
 * for either is granted exactly the spec defaults, which puts the ceiling at
 * 4 194 304 slots (32 bytes of transform row) no matter what the hardware could
 * offer. Past it `createBuffer` still succeeds and `createBindGroup` does not,
 * so the failure is an uncaptured validation error and a root that silently
 * stops drawing.
 *
 * The contract under test is therefore the REFUSAL: a store must answer that it
 * cannot represent such a selection, before anything is allocated, so the plan
 * can put the root back on the streamed path.
 */

import { persistentSlotGrowthCapacity, WebGpuPersistentSlotStore } from '#rendering/webgpu/WebGpuPersistentSlotStore';

/** WebGPU's spec defaults — what a device gets when nothing higher is requested. */
const DEFAULT_MAX_BUFFER_SIZE = 2 ** 28; // 256 MiB
const DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE = 2 ** 27; // 128 MiB

/** Mirrors the store's own row layout; a change to either must fail here loudly. */
const TRANSFORM_BYTES_PER_SLOT = 8 * Float32Array.BYTES_PER_ELEMENT;
const ORDER_BYTES_PER_ENTRY = Uint32Array.BYTES_PER_ELEMENT;
const INITIAL_CAPACITY = 2 ** 10;

/** Slots the default limits allow: the binding limit divided by the widest row. */
const DEFAULT_SLOT_CEILING = DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE / TRANSFORM_BYTES_PER_SLOT;
/** Order entries the default limits allow, which is a different, much later ceiling. */
const DEFAULT_ORDER_CEILING = DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE / ORDER_BYTES_PER_ENTRY;

const createMockDevice = (limits?: Partial<GPUSupportedLimits>): GPUDevice =>
  ({
    limits,
    createBuffer: () => ({ destroy: () => undefined }) as unknown as GPUBuffer,
    queue: { writeBuffer: () => undefined },
  }) as unknown as GPUDevice;

/**
 * Run `body` with the `GPUBufferUsage` flags the store reads at buffer creation.
 * They are a browser global the node lane does not have.
 */
const withGpuBufferUsage = (body: () => void): void => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'GPUBufferUsage');

  Object.defineProperty(globalThis, 'GPUBufferUsage', { configurable: true, value: { STORAGE: 128, COPY_DST: 8, UNIFORM: 64 } });

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

const createStore = (limits?: Partial<GPUSupportedLimits>): WebGpuPersistentSlotStore => {
  const store = new WebGpuPersistentSlotStore();

  store.connectDevice(createMockDevice(limits), undefined as never);

  return store;
};

const defaultLimits = {
  maxBufferSize: DEFAULT_MAX_BUFFER_SIZE,
  maxStorageBufferBindingSize: DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE,
} as Partial<GPUSupportedLimits>;

describe('WebGpuPersistentSlotStore device limits', () => {
  test('accepts an ordinary selection', () => {
    withGpuBufferUsage(() => {
      const store = createStore(defaultLimits);

      expect(store.canRepresent(1, 1)).toBe(true);
      expect(store.canRepresent(100000, 100000)).toBe(true);
      expect(store.canRepresent(1000000, 1000000)).toBe(true);
    });
  });

  test('accepts the last capacity that still fits, and refuses the first growth past it', () => {
    withGpuBufferUsage(() => {
      const store = createStore(defaultLimits);

      // Capacity is a power of two, so the whole band below the ceiling settles
      // on the ceiling itself: it is the last capacity the device can bind.
      expect(store.canRepresent(DEFAULT_SLOT_CEILING / 2 + 1, 1)).toBe(true);
      expect(store.canRepresent(DEFAULT_SLOT_CEILING - 1, 1)).toBe(true);

      // Exactly on the boundary: the binding is `maxStorageBufferBindingSize`
      // bytes, which the limit ADMITS — a refusal here would cost the fast path
      // a capacity the device can serve.
      expect(store.canRepresent(DEFAULT_SLOT_CEILING, 1)).toBe(true);

      // One slot more doubles the capacity, which is what actually fails: the
      // 256 MiB transform buffer is still creatable (it is exactly
      // `maxBufferSize`) and cannot be bound as storage.
      expect(store.canRepresent(DEFAULT_SLOT_CEILING + 1, 1)).toBe(false);
    });
  });

  test('bounds the order stream on its own limit, not the slot one', () => {
    withGpuBufferUsage(() => {
      const store = createStore(defaultLimits);

      // Four bytes an entry rather than 32, so the order buffer's own ceiling is
      // eight times further out. It can never be the first buffer to break in a
      // sprite store — order entries never outnumber slots — which is exactly
      // why it needs its own assertion.
      expect(store.canRepresent(INITIAL_CAPACITY, DEFAULT_ORDER_CEILING)).toBe(true);
      expect(store.canRepresent(INITIAL_CAPACITY, DEFAULT_ORDER_CEILING + 1)).toBe(false);
    });
  });

  test('takes whichever of the two limits binds first', () => {
    withGpuBufferUsage(() => {
      // A device that raised the binding limit but not the allocation one: the
      // buffer size now decides, at twice the default slot ceiling.
      const store = createStore({
        maxBufferSize: DEFAULT_MAX_BUFFER_SIZE,
        maxStorageBufferBindingSize: DEFAULT_MAX_BUFFER_SIZE * 8,
      } as Partial<GPUSupportedLimits>);

      const ceiling = DEFAULT_MAX_BUFFER_SIZE / TRANSFORM_BYTES_PER_SLOT;

      expect(store.canRepresent(ceiling, 1)).toBe(true);
      expect(store.canRepresent(ceiling + 1, 1)).toBe(false);
    });
  });

  test('falls back to the spec defaults for a device that exposes no limits', () => {
    withGpuBufferUsage(() => {
      const store = createStore(undefined);

      // A conformant device is never granted LESS than the defaults, so assuming
      // them is safe; assuming no ceiling at all would be the unsafe direction.
      expect(store.canRepresent(DEFAULT_SLOT_CEILING, 1)).toBe(true);
      expect(store.canRepresent(DEFAULT_SLOT_CEILING + 1, 1)).toBe(false);
    });
  });

  test('re-reads the ceiling from the device it is currently connected to', () => {
    withGpuBufferUsage(() => {
      const store = createStore({
        maxBufferSize: DEFAULT_MAX_BUFFER_SIZE * 8,
        maxStorageBufferBindingSize: DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE * 8,
      } as Partial<GPUSupportedLimits>);

      expect(store.canRepresent(DEFAULT_SLOT_CEILING * 4, 1)).toBe(true);

      // Device loss, then recovery onto a device granting only the defaults. A
      // ceiling cached from the lost device would still admit the selection.
      store.invalidateDeviceResources();
      store.connectDevice(createMockDevice(defaultLimits), undefined as never);

      expect(store.canRepresent(DEFAULT_SLOT_CEILING * 4, 1)).toBe(false);
      expect(store.canRepresent(DEFAULT_SLOT_CEILING, 1)).toBe(true);
    });
  });

  test('refuses everything while no device is connected', () => {
    const store = new WebGpuPersistentSlotStore();

    // Nothing can be allocated without a device, so there is no capacity the
    // store could honestly claim to represent.
    expect(store.canRepresent(1, 1)).toBe(false);
  });

  test('predicts the capacity growth actually settles on', () => {
    withGpuBufferUsage(() => {
      // The ceiling is expressed in the growth policy's own terms, so the two
      // must not drift: what `canRepresent` measures has to be the capacity
      // `ensureCapacity` allocates.
      for (const slots of [1, INITIAL_CAPACITY, INITIAL_CAPACITY + 1, 1500, 100000]) {
        const probe = createStore(defaultLimits);

        probe.ensureCapacity(slots);
        expect(persistentSlotGrowthCapacity(slots)).toBe(probe.slotCapacity);
      }
    });
  });
});
