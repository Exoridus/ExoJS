import type { PhasedSceneTransition } from '#core/PhasedSceneTransition';
import type { SceneTransition } from '#core/SceneTransition';
import type { SceneTransitionPhases, SceneTransitionSelection } from '#core/SceneTypes';

declare const enterPhase: PhasedSceneTransition;
declare const exitPhase: PhasedSceneTransition;
declare const transitionInstance: SceneTransition;

// SceneTransitionPhases requires at least one of { enter, exit } — a union
// of two variants, not an interface with both fields optional (confirmed,
// TypeScript --strict: the interface form types `{}` as valid, which would
// silently suppress a scene's registry default while looking like a no-op).
const _enterOnly: SceneTransitionPhases = { enter: enterPhase };
const _exitOnly: SceneTransitionPhases = { exit: exitPhase };
const _both: SceneTransitionPhases = { enter: enterPhase, exit: exitPhase };
// @ts-expect-error — neither field present must be rejected
const _neither: SceneTransitionPhases = {};

// SceneTransitionSelection: SceneTransition | SceneTransitionPhases | false
const _selectionTransition: SceneTransitionSelection = transitionInstance;
const _selectionPhasedInstance: SceneTransitionSelection = enterPhase; // a PhasedSceneTransition IS a SceneTransition
const _selectionPhases: SceneTransitionSelection = { enter: enterPhase };
const _selectionFalse: SceneTransitionSelection = false;
// @ts-expect-error — {} is not a valid SceneTransitionSelection either (same empty-phases rejection)
const _selectionEmpty: SceneTransitionSelection = {};

export {};
