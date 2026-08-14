/**
 * @internal
 *
 * The `(zIndex, seq)` bookkeeping every entry container maintains while it is
 * being filled.
 *
 * It exists as its own primitive because two different containers need the
 * exact same rule: a frame-local {@link GroupScope}, and a {@link SourceGroup}
 * inside a persistent {@link RenderRootSource}. Handing the source a dummy
 * `GroupScope` to borrow the rule would tie a backend- and frame-neutral
 * structure to the frame-local plan; writing the rule a second time inside the
 * source would fork a contract that decides pixel order.
 *
 * `(zIndex, seq)` IS that contract: the optimizer sorts a scope by `zIndex` and
 * keeps `seq` as the tie-break, so two draws with equal `zIndex` still paint in
 * `seq` order. A second, subtly different implementation of it would not fail a
 * type check — it would change draw order.
 */
export interface EntryPlacementState {
  /** Next auto-assigned sequence number; also the high-water mark of explicit ones. */
  _nextSeq: number;
  /** `zIndex` of the first entry placed, or `null` while the container is empty. */
  firstZ: number | null;
  /** `true` once two entries with differing `zIndex` have been placed. */
  hasMixedZ: boolean;
}

/**
 * Place one entry and return the sequence number it occupies.
 *
 * `seq` is the caller's explicit placement — a child index, or a verbatim
 * position replayed from a capture or selected from a source. `undefined` means
 * "append": take the next free slot. Either way the high-water mark advances, so
 * a later sibling in the same container can never collide with a slot that was
 * handed out explicitly.
 */
export const reserveEntryPlacement = (state: EntryPlacementState, seq: number | undefined, zIndex: number): number => {
  const placedSeq = seq ?? state._nextSeq;

  if (placedSeq >= state._nextSeq) {
    state._nextSeq = placedSeq + 1;
  }

  if (state.firstZ === null) {
    state.firstZ = zIndex;
  } else if (!state.hasMixedZ && state.firstZ !== zIndex) {
    state.hasMixedZ = true;
  }

  return placedSeq;
};
