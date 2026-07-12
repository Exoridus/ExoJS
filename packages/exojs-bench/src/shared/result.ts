/**
 * Domain-agnostic cell-result core (review #325: `CellResult` was
 * rendering-coupled and living under `rendering/`).
 *
 * Every benchmark domain measures a matrix of cells and reports, per cell,
 * whether it completed and an optional explanation — regardless of what the
 * cell actually measured (per-frame GPU time for rendering, per-`step` CPU time
 * for physics). Those three fields are the genuinely shared shape; each domain
 * extends {@link BaseCellResult} with its own spec type, timing fields and
 * structural counters (draw calls for rendering, body/contact counts for
 * physics), which stay in the domain folder.
 */

/** Whether a cell completed normally, exceeded a budget, or could not be measured. */
export type CellStatus = 'ok' | 'exceeded' | 'unavailable';

/**
 * Shared base every domain's per-cell result extends. Generic over the domain's
 * own cell-spec type so the spec stays strongly typed while the status/note
 * contract is written once.
 */
export interface BaseCellResult<TSpec> {
  /** The cell this result belongs to. */
  readonly spec: TSpec;
  /** Whether the cell completed normally, exceeded a budget, or could not be measured. */
  readonly status: CellStatus;
  /** Optional free-text note explaining a non-`'ok'` status (or a disclosed caveat). */
  readonly note?: string;
}
