/**
 * Opaque, stable identity for one scope pushed via
 * {@link InteractionSystem.pushScope}. Release exactly that scope - wherever
 * it currently sits in the stack - through the matching
 * {@link InteractionSystem.popScope} call, regardless of whether other
 * scopes were pushed (and are still active) above or below it.
 *
 * A token, not the scope's `root` node, is what identifies an entry: two
 * scopes can legitimately share the same root (nesting a scope on a node
 * that is already a scope root), and only a token distinguishes which of the
 * two a given `popScope` call means to release.
 */
export type ScopeToken = object;

/** Mint a fresh, unique scope token. @internal */
export const createScopeToken = (): ScopeToken => ({});
