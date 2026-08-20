import type { InputToken } from '#input/InputToken';

/** Which action kind a {@link SerializedActionBinding} belongs to. */
export type ActionKind = 'button' | 'axis' | 'vector' | 'chord' | 'sequence';

/** One alternative of a serialized {@link AxisAction} binding. */
export interface SerializedAxisEntry {
  /** A directly signed source (a stick axis). Mutually exclusive with the composite pair. */
  readonly direct?: InputToken;
  readonly negative?: readonly InputToken[];
  readonly positive?: readonly InputToken[];
}

/** One alternative of a serialized {@link VectorAction} binding. */
export interface SerializedVectorEntry {
  readonly x?: readonly InputToken[];
  readonly y?: readonly InputToken[];
  readonly up?: readonly InputToken[];
  readonly down?: readonly InputToken[];
  readonly left?: readonly InputToken[];
  readonly right?: readonly InputToken[];
}

/**
 * One action's binding in its persistable form - the shape a
 * {@link BindingProfile} stores and a save file round-trips.
 *
 * Chord and sequence bindings are stored NORMALIZED (alternatives of channel
 * groups, and steps of those) rather than as the `'Control+S|Meta+S'` shorthand
 * a developer may have written the default with: the shorthand resolves only
 * `Keyboard` names, so a player who rebinds a chord onto a gamepad button
 * could not be expressed in it.
 *
 * `kind` is validated against the live action when a profile is applied. A
 * stored binding whose kind no longer matches is rejected rather than
 * partially applied - an action that changed from a button into an axis
 * between builds is a developer-side break, not something to guess at.
 */
export type SerializedActionBinding =
  | { readonly kind: 'button'; readonly binding: readonly InputToken[] }
  | { readonly kind: 'axis'; readonly binding: readonly SerializedAxisEntry[] }
  | { readonly kind: 'vector'; readonly binding: readonly SerializedVectorEntry[] }
  | { readonly kind: 'chord'; readonly binding: ReadonlyArray<readonly InputToken[]> }
  | { readonly kind: 'sequence'; readonly binding: ReadonlyArray<ReadonlyArray<readonly InputToken[]>> };
