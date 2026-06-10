/**
 * How a scalable sprite fills its destination span.
 *
 * Shared by {@link NineSliceSprite} edges/center and {@link RepeatingSprite}.
 * @stable
 */
export type RepeatMode =
  | 'stretch'
  | 'repeat'
  | 'mirror-repeat';

/**
 * How a `'repeat'` or `'mirror-repeat'` run fits its destination span exactly.
 * @stable
 */
export type RepeatFit =
  | 'clip'
  | 'round';

/**
 * A single placement segment produced by the repeat planner.
 *
 * Each segment describes one contiguous destination slice and the corresponding
 * normalised source texel interval.
 * @advanced
 */
export interface RepeatSegment {
  /** Start position of this segment within the destination span. */
  readonly destinationStart: number;
  /** Length of this segment in destination units. */
  readonly destinationLength: number;

  /**
   * Normalised source start coordinate (0..1 range in logical source space).
   * For mirrored segments this is greater than {@link sourceEnd}.
   */
  readonly sourceStart: number;
  /**
   * Normalised source end coordinate (0..1 range in logical source space).
   * For mirrored segments this is less than {@link sourceStart}.
   */
  readonly sourceEnd: number;

  /**
   * `true` when this segment should be rendered with mirrored (flipped)
   * orientation. Always consistent with `sourceStart > sourceEnd`.
   */
  readonly mirrored: boolean;
}

/**
 * Result of a repeat-planning call.
 *
 * Contains the resolved destination length and the ordered list of segments
 * that collectively fill the span.
 * @advanced
 */
export interface RepeatPlan {
  /** Total destination span length (equal to the requested length). */
  readonly destinationLength: number;
  /**
   * The source length that was passed to the planner.
   * Useful for consumers that need to map back to source scale.
   */
  readonly sourceLength: number;
  /** Ordered, non-overlapping segments that fill the destination span. */
  readonly segments: readonly RepeatSegment[];
}

/**
 * Validate generic numeric inputs shared across all modes.
 * Throws unconditionally — these are user/programming errors, not dev-only
 * assertions.
 */
function validateInputs(sourceLength: number, destinationLength: number): void {
  if (!Number.isFinite(sourceLength) || !Number.isFinite(destinationLength)) {
    throw new Error(
      `RepeatPlanner: sourceLength and destinationLength must be finite numbers (got ${sourceLength}, ${destinationLength}).`,
    );
  }

  if (sourceLength <= 0) {
    throw new Error(
      `RepeatPlanner: sourceLength must be positive (got ${sourceLength}).`,
    );
  }

  if (destinationLength < 0) {
    throw new Error(
      `RepeatPlanner: destinationLength must be non-negative (got ${destinationLength}).`,
    );
  }
}

function buildStretchPlan(destinationLength: number, sourceLength: number): RepeatPlan {
  if (destinationLength === 0) {
    return {
      destinationLength: 0,
      sourceLength,
      segments: [],
    };
  }

  const segment: RepeatSegment = {
    destinationStart: 0,
    destinationLength,
    sourceStart: 0,
    sourceEnd: 1,
    mirrored: false,
  };

  return {
    destinationLength,
    sourceLength,
    segments: [segment],
  };
}

function buildClipPlan(destinationLength: number, sourceLength: number, mirror: boolean): RepeatPlan {
  if (destinationLength === 0) {
    return {
      destinationLength: 0,
      sourceLength,
      segments: [],
    };
  }

  const segments: RepeatSegment[] = [];
  let cursor = 0;
  let index = 0;

  while (cursor < destinationLength) {
    const remaining = destinationLength - cursor;
    const segLength = Math.min(sourceLength, remaining);
    const sourceFraction = segLength / sourceLength;

    const mirrored = mirror && (index % 2 === 1);

    const segment: RepeatSegment = {
      destinationStart: cursor,
      destinationLength: segLength,
      sourceStart: mirrored ? 1 : 0,
      sourceEnd: mirrored ? 1 - sourceFraction : sourceFraction,
      mirrored,
    };

    segments.push(segment);
    cursor += segLength;
    index++;
  }

  return {
    destinationLength,
    sourceLength,
    segments,
  };
}

function buildRoundPlan(destinationLength: number, sourceLength: number, mirror: boolean): RepeatPlan {
  if (destinationLength === 0) {
    return {
      destinationLength: 0,
      sourceLength,
      segments: [],
    };
  }

  const ratio = destinationLength / sourceLength;
  const count = Math.max(1, Math.round(ratio));
  const segLength = destinationLength / count;

  const segments: RepeatSegment[] = [];

  for (let i = 0; i < count; i++) {
    const mirrored = mirror && (i % 2 === 1);

    const segment: RepeatSegment = {
      destinationStart: i * segLength,
      destinationLength: segLength,
      sourceStart: mirrored ? 1 : 0,
      sourceEnd: mirrored ? 0 : 1,
      mirrored,
    };

    segments.push(segment);
  }

  return {
    destinationLength,
    sourceLength,
    segments,
  };
}

/**
 * Compute a deterministic repeat plan for filling a destination span with a
 * tiled or stretched source pattern.
 *
 * This is a **pure, renderer-independent** function used as the shared repeat
 * layout engine by {@link NineSliceSprite} edges/center,
 * {@link RepeatingSprite} geometry path, and tilemap chunk builders.
 *
 * ## Modes
 *
 * | Mode             | Behaviour |
 * |------------------|-----------|
 * | `'stretch'`      | One segment stretched to the full destination. `fit` is ignored. |
 * | `'repeat'`       | Native-size repeats; final segment is clipped when the destination is not an exact multiple. |
 * | `'mirror-repeat'`| Alternating normal/mirrored segments (period-2). Clipped final segment when non-exact. |
 *
 * ## Fit
 *
 * | Fit      | Effect |
 * |----------|--------|
 * | `'clip'` | Native-size segments; the final segment is clipped if necessary. |
 * | `'round'`| Integer count of equally-sized segments stretched or squeezed so the destination fills exactly. |
 *
 * ## Allocation and caching
 *
 * The planner returns a new result object on every call. Callers should
 * cache the plan and recompute only when `sourceLength`, `destinationLength`,
 * `mode`, or `fit` changes — typically on resize or texture change.
 *
 * @param sourceLength - Native size of the source pattern in destination units.
 * @param destinationLength - Total span to fill.
 * @param mode - Fill strategy.
 * @param fit - Fitting strategy for `'repeat'` / `'mirror-repeat'`. Ignored for `'stretch'`.
 * @throws When inputs are non-finite, negative, or zero-length source.
 * @advanced
 */
export function planRepeat(
  sourceLength: number,
  destinationLength: number,
  mode: RepeatMode,
  fit: RepeatFit = 'round',
): RepeatPlan {
  validateInputs(sourceLength, destinationLength);

  switch (mode) {
    case 'stretch':
      return buildStretchPlan(destinationLength, sourceLength);

    case 'repeat':
      if (fit === 'round') {
        return buildRoundPlan(destinationLength, sourceLength, false);
      }
      return buildClipPlan(destinationLength, sourceLength, false);

    case 'mirror-repeat':
      if (fit === 'round') {
        return buildRoundPlan(destinationLength, sourceLength, true);
      }
      return buildClipPlan(destinationLength, sourceLength, true);

    default: {
      // Exhaustiveness check: if a new RepeatMode is added, the assignment below
      // will fail to compile (mode will not be assignable to never).
      const _exhaustive: never = mode;
      void _exhaustive;
      throw new Error(`RepeatPlanner: unknown RepeatMode.`);
    }
  }
}
