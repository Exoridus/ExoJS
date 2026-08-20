/// <reference types="@webgpu/types" />

/**
 * Whether the ORDINARY WebGPU storage buffers admit that a frame is too big for
 * the device they are about to allocate on.
 *
 * These are the buffers the persistent slot store's refusal falls back to: the
 * frame-global shared transform + tint storage, and the per-group retained
 * transform + tint storage. All four are `storage` bindings bound in full, with
 * no `offset`/`size` sub-range, so each is bounded by
 * `min(maxBufferSize, maxStorageBufferBindingSize)` of the GRANTED device limits.
 * Past that ceiling `createBuffer` still succeeds - the doubled size is exactly
 * `maxBufferSize` - and `createBindGroup` does not, which makes the failure an
 * uncaptured validation error, a frame that draws nothing, and a loop that keeps
 * running.
 *
 * There is no further representation to fall back to here, so the contract under
 * test is fail-closed: a typed `RenderError` before the allocation, naming the
 * store, the capacity the growth policy settles on, and which limit binds.
 */

import { GpuResourceAccountant } from '#rendering/GpuResourceAccountant';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { RenderError } from '#rendering/RenderError';
import { createRenderStats } from '#rendering/RenderStats';
import { retainedTintSlotBytes, retainedTransformSlotBytes, WebGpuRetainedGroupBundle } from '#rendering/webgpu/WebGpuRetainedGroupResources';
import { WebGpuTransformStorage } from '#rendering/webgpu/WebGpuTransformStorage';

/** WebGPU's spec defaults - what a device gets when nothing higher is requested. */
const DEFAULT_MAX_BUFFER_SIZE = 2 ** 28; // 256 MiB
const DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE = 2 ** 27; // 128 MiB

/** Mirrors both stores' row layout; a change to either must fail here loudly. */
const TRANSFORM_BYTES_PER_ROW = 32;
const TINT_BYTES_PER_ROW = 4;

/** Rows the default limits allow: the binding limit divided by the widest row. */
const DEFAULT_ROW_CEILING = DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE / TRANSFORM_BYTES_PER_ROW;

const defaultLimits = {
  maxBufferSize: DEFAULT_MAX_BUFFER_SIZE,
  maxStorageBufferBindingSize: DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE,
} as Partial<GPUSupportedLimits>;

interface MockDevice {
  readonly device: GPUDevice;
  readonly sizes: number[];
}

const createMockDevice = (limits: Partial<GPUSupportedLimits> | undefined = defaultLimits): MockDevice => {
  const sizes: number[] = [];

  const device = {
    limits,
    createBuffer: (descriptor: GPUBufferDescriptor) => {
      sizes.push(descriptor.size);

      return { destroy: () => undefined } as unknown as GPUBuffer;
    },
    queue: { writeBuffer: () => undefined },
  } as unknown as GPUDevice;

  return { device, sizes };
};

/**
 * Run `body` with the `GPUBufferUsage` flags the stores read at buffer creation.
 * They are a browser global the node lane does not have.
 */
const withGpuBufferUsage = (body: () => void): void => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'GPUBufferUsage');

  Object.defineProperty(globalThis, 'GPUBufferUsage', {
    configurable: true,
    value: { STORAGE: 128, COPY_DST: 8, UNIFORM: 64, VERTEX: 32 },
  });

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

const createBundle = (): WebGpuRetainedGroupBundle => new WebGpuRetainedGroupBundle(new GpuResourceAccountant(createRenderStats()), () => undefined);

/** Assert `body` fails with this fix's contract and name the store it blames. */
const expectRefusal = (body: () => void, store: string): RenderError => {
  let caught: unknown = null;

  try {
    body();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(RenderError);

  const error = caught as RenderError;

  expect(error.code).toBe('out-of-memory');
  expect(error.backendType).toBe(RenderBackendType.WebGpu);
  expect(error.message).toContain(store);

  return error;
};

describe('WebGpuTransformStorage device limits', () => {
  test('accepts the last capacity the device can bind, and refuses the first growth past it', () => {
    withGpuBufferUsage(() => {
      // The band below the ceiling settles on the ceiling itself - capacity is a
      // power of two - so it is the last capacity the device can serve.
      const below = createMockDevice();

      new WebGpuTransformStorage().reserve(below.device, DEFAULT_ROW_CEILING / 2 + 1);
      expect(below.sizes).toContain(DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE);

      // Exactly on the boundary: the binding is `maxStorageBufferBindingSize`
      // bytes, which the limit ADMITS. A refusal here would cost the frame a
      // capacity the device can bind.
      const exact = createMockDevice();

      new WebGpuTransformStorage().reserve(exact.device, DEFAULT_ROW_CEILING);
      expect(exact.sizes).toContain(DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE);

      // One row more doubles the capacity, and that is what actually fails: the
      // 256 MiB transform buffer is still creatable (it is exactly
      // `maxBufferSize`) and cannot be bound as storage.
      const over = createMockDevice();

      const error = expectRefusal(() => new WebGpuTransformStorage().reserve(over.device, DEFAULT_ROW_CEILING + 1), 'shared transform storage');

      // Diagnosis must carry the numbers a reader needs to act, not just the fact.
      expect(error.message).toContain(String(DEFAULT_ROW_CEILING * 2));
      expect(error.detail).toContain(String(DEFAULT_ROW_CEILING + 1));
      expect(error.detail).toContain(String(DEFAULT_MAX_BUFFER_SIZE));
      expect(error.detail).toContain(String(DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE));
      expect(error.detail).toContain('maxStorageBufferBindingSize');

      // Fail CLOSED: nothing was allocated on the way to the refusal.
      expect(over.sizes).toEqual([]);
    });
  });

  test('refuses through getBuffer as well, not only through reserve', () => {
    withGpuBufferUsage(() => {
      const mock = createMockDevice();

      expectRefusal(() => new WebGpuTransformStorage().getBuffer(mock.device, DEFAULT_ROW_CEILING + 1), 'shared transform storage');
      expect(mock.sizes).toEqual([]);
    });
  });

  test('takes whichever of the two limits binds first', () => {
    withGpuBufferUsage(() => {
      // A device with a smaller allocation limit: the buffer size decides.
      const bufferBound = createMockDevice({
        maxBufferSize: 2 ** 26,
        maxStorageBufferBindingSize: DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE,
      } as Partial<GPUSupportedLimits>);
      const bufferCeiling = 2 ** 26 / TRANSFORM_BYTES_PER_ROW;

      new WebGpuTransformStorage().reserve(bufferBound.device, bufferCeiling);
      expect(bufferBound.sizes).toContain(2 ** 26);

      const overBuffer = createMockDevice({
        maxBufferSize: 2 ** 26,
        maxStorageBufferBindingSize: DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE,
      } as Partial<GPUSupportedLimits>);

      expect(expectRefusal(() => new WebGpuTransformStorage().reserve(overBuffer.device, bufferCeiling + 1), 'shared transform storage').detail).toContain(
        'maxBufferSize',
      );

      // A device with a smaller binding limit: the binding size decides, at the
      // same row count but for the other reason.
      const bindingBound = createMockDevice({
        maxBufferSize: DEFAULT_MAX_BUFFER_SIZE,
        maxStorageBufferBindingSize: 2 ** 26,
      } as Partial<GPUSupportedLimits>);

      new WebGpuTransformStorage().reserve(bindingBound.device, bufferCeiling);
      expect(bindingBound.sizes).toContain(2 ** 26);

      const overBinding = createMockDevice({
        maxBufferSize: DEFAULT_MAX_BUFFER_SIZE,
        maxStorageBufferBindingSize: 2 ** 26,
      } as Partial<GPUSupportedLimits>);

      expect(expectRefusal(() => new WebGpuTransformStorage().reserve(overBinding.device, bufferCeiling + 1), 'shared transform storage').detail).toContain(
        'maxStorageBufferBindingSize',
      );
    });
  });

  test('falls back to the spec defaults for a device that exposes no limits', () => {
    withGpuBufferUsage(() => {
      const accepted = createMockDevice(undefined);

      // A conformant device is never granted LESS than the defaults, so assuming
      // them is safe; assuming no ceiling at all would be the unsafe direction.
      new WebGpuTransformStorage().reserve(accepted.device, DEFAULT_ROW_CEILING);
      expect(accepted.sizes).toContain(DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE);

      const refused = createMockDevice(undefined);

      expectRefusal(() => new WebGpuTransformStorage().reserve(refused.device, DEFAULT_ROW_CEILING + 1), 'shared transform storage');
    });
  });

  test('reads the limits of the device it is currently growing on', () => {
    withGpuBufferUsage(() => {
      const storage = new WebGpuTransformStorage();
      const generous = createMockDevice({
        maxBufferSize: DEFAULT_MAX_BUFFER_SIZE * 8,
        maxStorageBufferBindingSize: DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE * 8,
      } as Partial<GPUSupportedLimits>);

      storage.reserve(generous.device, DEFAULT_ROW_CEILING * 4);
      expect(generous.sizes).toContain(DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE * 4);

      // Device loss, then recovery onto a device granting only the defaults. A
      // ceiling cached from the lost device would still admit the growth.
      storage.destroy();

      const modest = createMockDevice(defaultLimits);

      expectRefusal(() => storage.reserve(modest.device, DEFAULT_ROW_CEILING * 4), 'shared transform storage');
      expect(modest.sizes).toEqual([]);
    });
  });

  test('leaves an ordinary growth structurally unchanged', () => {
    withGpuBufferUsage(() => {
      const mock = createMockDevice();

      new WebGpuTransformStorage().reserve(mock.device, 1000);

      // Doubling from one row's worth of bytes: 32 → 32768, i.e. 1024 rows, and
      // a tint buffer covering exactly the same rows. Both sizes are pinned so a
      // guard cannot quietly change what gets allocated.
      expect(mock.sizes).toEqual([1024 * TRANSFORM_BYTES_PER_ROW, 1024 * TINT_BYTES_PER_ROW]);
    });
  });
});

describe('WebGpuRetainedGroupBundle device limits', () => {
  const instanceBytes = 1024;

  test('grows on the row widths this file assumes', () => {
    // Every ceiling below is derived from these two numbers; a layout change has
    // to fail here rather than silently move the boundaries under the tests.
    expect(retainedTransformSlotBytes).toBe(TRANSFORM_BYTES_PER_ROW);
    expect(retainedTintSlotBytes).toBe(TINT_BYTES_PER_ROW);
  });

  test('accepts the last transform capacity the device can bind, and refuses the first growth past it', () => {
    withGpuBufferUsage(() => {
      const exact = createMockDevice();

      createBundle().ensureCapacity(exact.device, instanceBytes, DEFAULT_ROW_CEILING * TRANSFORM_BYTES_PER_ROW, TINT_BYTES_PER_ROW);
      expect(exact.sizes).toContain(DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE);

      const over = createMockDevice();
      const error = expectRefusal(
        () => createBundle().ensureCapacity(over.device, instanceBytes, (DEFAULT_ROW_CEILING + 1) * TRANSFORM_BYTES_PER_ROW, TINT_BYTES_PER_ROW),
        'retained group transform storage',
      );

      expect(error.message).toContain(String(DEFAULT_ROW_CEILING * 2));
      expect(error.detail).toContain(String(DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE));

      // Fail CLOSED across the whole call: not even the instance buffer, which
      // is checked first today and would be representable on its own.
      expect(over.sizes).toEqual([]);
    });
  });

  test('bounds the tint storage on its own row width, not the transform one', () => {
    withGpuBufferUsage(() => {
      // Four bytes a row rather than 32, so the tint ceiling is eight times
      // further out. It can never break first in lockstep growth - which is
      // exactly why the two buffers grow independently here and need their own
      // boundary.
      const tintCeilingRows = DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE / TINT_BYTES_PER_ROW;
      const exact = createMockDevice();

      createBundle().ensureCapacity(exact.device, instanceBytes, TRANSFORM_BYTES_PER_ROW, tintCeilingRows * TINT_BYTES_PER_ROW);
      expect(exact.sizes).toContain(DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE);

      const over = createMockDevice();

      expectRefusal(
        () => createBundle().ensureCapacity(over.device, instanceBytes, TRANSFORM_BYTES_PER_ROW, (tintCeilingRows + 1) * TINT_BYTES_PER_ROW),
        'retained group tint storage',
      );
      expect(over.sizes).toEqual([]);
    });
  });

  test('takes whichever of the two limits binds first', () => {
    withGpuBufferUsage(() => {
      const ceilingRows = 2 ** 26 / TRANSFORM_BYTES_PER_ROW;
      const bufferBound = {
        maxBufferSize: 2 ** 26,
        maxStorageBufferBindingSize: DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE,
      } as Partial<GPUSupportedLimits>;
      const bindingBound = {
        maxBufferSize: DEFAULT_MAX_BUFFER_SIZE,
        maxStorageBufferBindingSize: 2 ** 26,
      } as Partial<GPUSupportedLimits>;

      for (const limits of [bufferBound, bindingBound]) {
        const accepted = createMockDevice(limits);

        createBundle().ensureCapacity(accepted.device, instanceBytes, ceilingRows * TRANSFORM_BYTES_PER_ROW, TINT_BYTES_PER_ROW);
        expect(accepted.sizes).toContain(2 ** 26);

        const refused = createMockDevice(limits);

        expectRefusal(
          () => createBundle().ensureCapacity(refused.device, instanceBytes, (ceilingRows + 1) * TRANSFORM_BYTES_PER_ROW, TINT_BYTES_PER_ROW),
          'retained group transform storage',
        );
        expect(refused.sizes).toEqual([]);
      }
    });
  });

  test('reads the limits of the device it is currently growing on', () => {
    withGpuBufferUsage(() => {
      const bundle = createBundle();
      const generous = createMockDevice({
        maxBufferSize: DEFAULT_MAX_BUFFER_SIZE * 8,
        maxStorageBufferBindingSize: DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE * 8,
      } as Partial<GPUSupportedLimits>);

      bundle.ensureCapacity(generous.device, instanceBytes, DEFAULT_ROW_CEILING * 4 * TRANSFORM_BYTES_PER_ROW, TINT_BYTES_PER_ROW);
      expect(generous.sizes).toContain(DEFAULT_MAX_STORAGE_BUFFER_BINDING_SIZE * 4);

      // Device loss drops every buffer; the recovered device grants the defaults.
      bundle.invalidateDeviceState(true);

      const modest = createMockDevice(defaultLimits);

      expectRefusal(
        () => bundle.ensureCapacity(modest.device, instanceBytes, DEFAULT_ROW_CEILING * 4 * TRANSFORM_BYTES_PER_ROW, TINT_BYTES_PER_ROW),
        'retained group transform storage',
      );
      expect(modest.sizes).toEqual([]);
    });
  });

  test('leaves an ordinary growth structurally unchanged', () => {
    withGpuBufferUsage(() => {
      const mock = createMockDevice();

      createBundle().ensureCapacity(mock.device, 1000, 100 * TRANSFORM_BYTES_PER_ROW, 100 * TINT_BYTES_PER_ROW);

      // Power-of-two growth from 256 B: instance 1000 → 1024, transform
      // 3200 → 4096, tint 400 → 512, plus the constant uniform block.
      expect(mock.sizes).toEqual([1024, 4096, 512, 144]);
    });
  });
});

describe('persistent refusal falls onto a path that now fails loudly', () => {
  test('a selection past the shared ceiling is refused by the store and thrown by the fallback', async () => {
    const { WebGpuPersistentSlotStore } = await import('#rendering/webgpu/WebGpuPersistentSlotStore');

    withGpuBufferUsage(() => {
      const mock = createMockDevice();
      const store = new WebGpuPersistentSlotStore();

      store.connectDevice(mock.device, undefined as never);

      // Step 1: the per-root store cannot represent the selection, so the plan
      // puts the root back on the streamed path.
      expect(store.canRepresent(DEFAULT_ROW_CEILING + 1, DEFAULT_ROW_CEILING + 1)).toBe(false);

      // Step 2: the streamed path needs the same rows in the frame-global
      // shared storage, against the same ceiling - and says so instead of
      // drawing nothing behind an uncaptured validation error.
      expectRefusal(() => new WebGpuTransformStorage().reserve(mock.device, DEFAULT_ROW_CEILING + 1), 'shared transform storage');
    });
  });
});
