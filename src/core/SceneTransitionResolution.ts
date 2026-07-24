import { resolvePhasedSelection } from './PhasedSceneTransition';
import { SceneTransition, type SceneTransitionOperation } from './SceneTransition';
import type { SceneTransitionPhases, SceneTransitionSelection } from './SceneTypes';

function isPhasesSelection(selection: SceneTransition | SceneTransitionPhases): selection is SceneTransitionPhases {
  return !(selection instanceof SceneTransition);
}

function resolveSelectionValue(selection: SceneTransitionSelection): SceneTransition | null {
  if (selection === false) {
    return null;
  }

  if (isPhasesSelection(selection)) {
    return resolvePhasedSelection(selection.exit, selection.enter);
  }

  return selection;
}

/**
 * Resolve a navigation call's `transition` option against a target scene's
 * registry-level default, per the exact per-operation order in spec §3.10:
 *
 * 1. An explicit call-site `transition` (a {@link SceneTransition},
 *    {@link SceneTransitionPhases}, or `false`) is used as-is — never
 *    merged with the registry default on either side.
 * 2. No call-site value: `change`/`restore` (and `start`, which delegates
 *    to `change()` — spec §3.7) fall back to the target's registry
 *    default, if any. `unload` never does, regardless of match kind — an
 *    unload is a discard, not an "entering" of the target.
 * 4. No call-site value and no applicable registry default: `null` — the
 *    direct, transition-free fast path (spec §3.3).
 *
 * Returns a ready-to-use {@link SceneTransition} (composing a
 * `{ enter, exit }` selection via {@link resolvePhasedSelection} if
 * needed) or `null` for "no transition."
 */
export function resolveSceneTransitionSelection(
  operation: SceneTransitionOperation,
  callSiteTransition: SceneTransitionSelection | undefined,
  registryDefault: SceneTransitionSelection | undefined,
): SceneTransition | null {
  if (callSiteTransition !== undefined) {
    return resolveSelectionValue(callSiteTransition);
  }

  if (operation === 'unload' || registryDefault === undefined) {
    return null;
  }

  return resolveSelectionValue(registryDefault);
}
