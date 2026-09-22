import { TRANSFORM_ROWS_PER_TEXTURE_LINE, WEBGL2_MIN_MAX_TEXTURE_SIZE } from '#rendering/shader/transformTextureLayout';
import { WebGl2PersistentSlotStore } from '#rendering/webgl2/WebGl2PersistentSlotStore';

/**
 * The plan asks a store whether a selection fits before it writes a slot, and
 * refuses the root onto the ordinary path on a `false`. Without this answer the
 * WebGL2 store found out in `ensureCapacity`, where the row texture layout
 * throws - an error out of the frame where WebGPU fell back quietly.
 */
describe('WebGl2PersistentSlotStore.canRepresent', () => {
  const rowsPerTexture = TRANSFORM_ROWS_PER_TEXTURE_LINE * WEBGL2_MIN_MAX_TEXTURE_SIZE;

  test('admits a selection whose grown capacity still fits the guaranteed texture size', () => {
    const store = new WebGl2PersistentSlotStore();

    expect(store.canRepresent(1, 1)).toBe(true);
    expect(store.canRepresent(rowsPerTexture, rowsPerTexture)).toBe(true);
  });

  test('refuses a selection whose grown capacity would exceed it, before any allocation', () => {
    const store = new WebGl2PersistentSlotStore();

    expect(store.canRepresent(rowsPerTexture + 1, rowsPerTexture + 1)).toBe(false);
  });
});
