/**
 * Upgrades a document body by exactly one schema version.
 *
 * A migration is pure: the body is its only input. It must not read or write
 * anything outside it (no network, loader, GPU, clock or randomness), must not
 * mutate its input, and must return the same output for the same input.
 * Whatever cannot be computed from the body alone belongs to the loader that
 * builds the runtime object, not to the document.
 *
 * `from` and `to` must be number literals (`readonly from = 1`) for the
 * compile-time chain checks of {@link MigrationChain} to see them.
 *
 * @typeParam From - the body at version `from`.
 * @typeParam To - the body at version `to`.
 *
 * @example
 * ```ts
 * class AtlasV1ToV2 implements Migration<AtlasDocumentV1, AtlasDocumentV2> {
 *   public readonly from = 1;
 *   public readonly to = 2;
 *
 *   public migrate(document: AtlasDocumentV1): AtlasDocumentV2 {
 *     return { pages: [{ $type: 'texture', source: document.image }], frames: toFrameList(document.frames) };
 *   }
 * }
 * ```
 * @advanced
 */
export interface Migration<From, To> {
  readonly from: number;
  readonly to: number;
  migrate(document: From): To;
}
