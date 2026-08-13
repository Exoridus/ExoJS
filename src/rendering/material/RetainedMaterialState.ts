import type { Material, MaterialBindingSchema } from './Material';

/** Renderer-private discriminator carried through retained batch payloads. */
const retainedMaterialStateKind = 'exojs:retained-material-state';

/**
 * Live-material handle recorded beside retained geometry. The material itself
 * remains authoritative for values and texture identities; the stamps cover
 * state that can change batching or the GPU layout.
 * @internal
 */
export interface RetainedMaterialState<M extends Material = Material> {
  readonly kind: typeof retainedMaterialStateKind;
  readonly material: M;
  readonly bindingSchema: MaterialBindingSchema;
  readonly pipelineKey: number;
}

/** Capture the structural stamps for one material batch. @internal */
export const createRetainedMaterialState = <M extends Material>(material: M): RetainedMaterialState<M> => ({
  kind: retainedMaterialStateKind,
  material,
  bindingSchema: material._bindingSchema,
  pipelineKey: material.pipelineKey,
});

/** Narrow an opaque renderer payload to a retained material descriptor. @internal */
export const isRetainedMaterialState = (value: unknown): value is RetainedMaterialState =>
  typeof value === 'object' && value !== null && (value as Partial<RetainedMaterialState>).kind === retainedMaterialStateKind;

/** Structural preflight: values/bound texture identities deliberately do not participate. @internal */
export const isRetainedMaterialStateValid = (state: RetainedMaterialState): boolean =>
  state.material._bindingSchema === state.bindingSchema && state.material.pipelineKey === state.pipelineKey;
