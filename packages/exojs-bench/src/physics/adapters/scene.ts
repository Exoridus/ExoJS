import { mutationSignature, selectMutationIndices } from '../../shared/mutation';
import { createRng } from '../../shared/rng';
import type { PhysicsArchetypeSpec, PhysicsSceneShape } from '../PhysicsAdapter';

/**
 * Engine-neutral description of a physics scene - the fairness backbone the
 * matter.js and rapier arms build from.
 *
 * The native `adapters/exojs-physics.ts` arm builds its scene inline against the
 * `@codexo/exojs-physics` API. The competitor arms cannot share that code (they
 * speak matter/rapier body APIs), so the risk is two hand-written transcriptions
 * quietly drifting into different scenes. This module removes that risk for the
 * competitor arms: it produces one neutral list of {@link BodyDesc}s, drawn from
 * the SAME shared deterministic RNG in the SAME order as the exojs arm, so
 * matter and rapier simulate a byte-identical body configuration to each other,
 * and - because the draw order is a faithful transcription of exojs-physics.ts -
 * to the native arm as well.
 *
 * The perturbed-body selection is routed through the shared
 * {@link selectMutationIndices} exactly as the native arm does, and its
 * {@link mutationSignature} is returned so each arm can hand it to the harness's
 * cross-arm determinism assertion (which fails loudly on any divergence).
 *
 * Coordinate convention matches exojs: +Y points DOWN, and a body's position is
 * the CENTRE of its box/circle. Both competitor arms adopt this same convention
 * so the numeric positions are identical across all three arms.
 */

/** Side length of a dynamic box / diameter reference for a dynamic circle, px. Mirrors `exojs-physics.ts`. */
export const BODY_SIZE = 16;
/** Peak per-axis initial speed applied to a perturbed body, px/s. Mirrors `exojs-physics.ts`. */
export const PERTURB_SPEED = 400;

/** A box (full width/height) or circle collider shape, engine-neutral. */
export type ShapeDesc = { readonly kind: 'box'; readonly width: number; readonly height: number } | { readonly kind: 'circle'; readonly radius: number };

/** One body in the neutral scene: its role, centre position, shape and material. */
export interface BodyDesc {
  /** Simulation role. */
  readonly type: 'static' | 'dynamic';
  /** World-space centre X (px). */
  readonly x: number;
  /** World-space centre Y (px, +Y down). */
  readonly y: number;
  /** Collider shape. */
  readonly shape: ShapeDesc;
  /** Mass density (px-area units); mirrors the exojs collider `density`. Ignored for static bodies. */
  readonly density: number;
  /** Coulomb friction coefficient; mirrors the exojs collider `friction`. */
  readonly friction: number;
  /** Restitution (bounciness); mirrors the exojs collider `restitution`. */
  readonly restitution: number;
  /** Initial linear velocity (px/s) for a perturbed dynamic body; absent when the body starts at rest. */
  readonly perturb?: { readonly vx: number; readonly vy: number };
}

/**
 * One revolute constraint between two bodies of the scene, engine-neutral.
 *
 * Bodies are referenced by their index in {@link SceneDescription.bodies} rather
 * than by object, so an arm resolves them through its own handle table and the
 * descriptor stays free of any engine's body type.
 */
export interface JointDesc {
  /** Index of the first body in {@link SceneDescription.bodies}. */
  readonly bodyA: number;
  /** Index of the second body. */
  readonly bodyB: number;
  /** World-space pivot both bodies are pinned to at creation (px). */
  readonly x: number;
  /** World-space pivot Y (px, +Y down). */
  readonly y: number;
}

/** A ray to cast: origin, unit direction and maximum distance, all in px. */
export interface RayDesc {
  /** Origin X (px). */
  readonly x: number;
  /** Origin Y (px, +Y down). */
  readonly y: number;
  /** Unit direction X. */
  readonly dx: number;
  /** Unit direction Y. */
  readonly dy: number;
  /** Maximum distance the ray travels (px). */
  readonly maxDistance: number;
}

/** A fully-described scene plus the determinism receipt for its perturbed-body selection. */
export interface SceneDescription {
  /** Every body in the scene, in creation order (statics first per archetype, then dynamics). */
  readonly bodies: readonly BodyDesc[];
  /** FNV-1a signature of the shared perturbed-index selection - the cross-arm determinism receipt. */
  readonly perturbedSignature: string;
  /**
   * Index in {@link bodies} at which the dynamic bodies start.
   *
   * Every scene creates its statics first, so a DYNAMIC index `i` (which is what
   * the perturbed/churned selection indexes) is `bodies[dynamicOffset + i]`. An
   * arm churning bodies needs that mapping and must not rediscover it by
   * scanning for `type === 'dynamic'`, which would silently disagree with the
   * selection the moment a scene interleaved the two.
   */
  readonly dynamicOffset: number;
  /** Constraints the scene builds, or an empty list for a joint-free scene. */
  readonly joints: readonly JointDesc[];
  /** Dynamic-body indices destroyed and rebuilt per step; empty unless the archetype churns. */
  readonly churnIndices: readonly number[];
  /** Extent of the world the scene occupies (px), used to lay out the ray sweep. */
  readonly extent: { readonly width: number; readonly height: number };
}

/** Default exojs collider restitution (`Collider.ts`: `options.restitution ?? 0`) for shapes exojs leaves unspecified. */
const DEFAULT_RESTITUTION = 0;
/** Friction the exojs `staticBox` helper stamps on every static collider. */
const STATIC_FRICTION = 0.5;

/** Build one static box descriptor - the neutral analogue of exojs `staticBox(...)`. */
const staticBox = (x: number, y: number, width: number, height: number): BodyDesc => ({
  type: 'static',
  x,
  y,
  shape: { kind: 'box', width, height },
  density: 1,
  friction: STATIC_FRICTION,
  restitution: DEFAULT_RESTITUTION,
});

/**
 * `box-stack`: `columns` independent stacks of boxes settling on a wide static
 * floor. Transcribes `exojs-physics.ts::buildBoxStack` draw-for-draw: the floor
 * is added first (no RNG), then one `rng()` jitter is drawn per placed dynamic
 * body in column-major order.
 */
const buildBoxStack = (bodies: BodyDesc[], bodyCount: number, rng: () => number): void => {
  const rows = 8;
  const columns = Math.max(1, Math.ceil(bodyCount / rows));
  const spacing = BODY_SIZE + 6;
  const floorTop = 1_200;
  const width = columns * spacing + 200;

  bodies.push(staticBox(width / 2, floorTop + 20, width, 40));

  let placed = 0;

  for (let c = 0; c < columns && placed < bodyCount; c++) {
    const x = 100 + c * spacing;

    for (let r = 0; r < rows && placed < bodyCount; r++) {
      const jitter = (rng() - 0.5) * 0.5;

      bodies.push({
        type: 'dynamic',
        x: x + jitter,
        y: floorTop - BODY_SIZE / 2 - 1 - r * BODY_SIZE,
        shape: { kind: 'box', width: BODY_SIZE, height: BODY_SIZE },
        density: 1,
        friction: 0.5,
        restitution: DEFAULT_RESTITUTION,
      });

      placed++;
    }
  }
};

/**
 * `many-dynamic`: a grid of small dynamic circles inside a bounded box, every
 * body given a deterministic initial impulse. Transcribes
 * `exojs-physics.ts::buildManyDynamic`: four static walls first (no RNG), then
 * two `rng()` draws (vx, vy) per perturbed body in ascending index order.
 */
const buildManyDynamic = (bodies: BodyDesc[], bodyCount: number, rng: () => number, perturbed: readonly number[]): void => {
  const radius = BODY_SIZE / 2;
  const cell = BODY_SIZE + 8;
  const columns = Math.ceil(Math.sqrt(bodyCount));
  const side = columns * cell + 80;
  const wall = 40;

  bodies.push(staticBox(side / 2, side + wall / 2, side + wall * 2, wall)); // floor
  bodies.push(staticBox(side / 2, -wall / 2, side + wall * 2, wall)); // ceiling
  bodies.push(staticBox(-wall / 2, side / 2, wall, side)); // left
  bodies.push(staticBox(side + wall / 2, side / 2, wall, side)); // right

  const perturbedSet = new Set(perturbed);

  for (let i = 0; i < bodyCount; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const base: BodyDesc = {
      type: 'dynamic',
      x: 40 + col * cell + radius,
      y: 40 + row * cell + radius,
      shape: { kind: 'circle', radius },
      density: 1,
      friction: 0,
      restitution: 0.4,
    };

    if (perturbedSet.has(i)) {
      const vx = (rng() - 0.5) * 2 * PERTURB_SPEED;
      const vy = (rng() - 0.5) * 2 * PERTURB_SPEED;

      bodies.push({ ...base, perturb: { vx, vy } });
    } else {
      bodies.push(base);
    }
  }
};

/**
 * `mixed-static-dynamic`: a static floor plus a lattice of static peg obstacles,
 * with dynamic boxes raining from above. Transcribes
 * `exojs-physics.ts::buildMixed`: floor then pegs (no RNG), then one `rng()`
 * jitter per dynamic body in index order.
 */
const buildMixed = (bodies: BodyDesc[], bodyCount: number, rng: () => number): void => {
  const spacing = BODY_SIZE + 10;
  const columns = Math.max(1, Math.ceil(Math.sqrt(bodyCount)));
  const fieldWidth = columns * spacing + 200;
  const floorTop = 1_400;

  bodies.push(staticBox(fieldWidth / 2, floorTop + 20, fieldWidth, 40));

  const pegRows = 4;

  for (let pr = 0; pr < pegRows; pr++) {
    const y = 500 + pr * 200;
    const offset = pr % 2 === 0 ? 0 : spacing;

    for (let x = 120 + offset; x < fieldWidth - 120; x += spacing * 2) {
      bodies.push(staticBox(x, y, BODY_SIZE * 2, BODY_SIZE / 2));
    }
  }

  for (let i = 0; i < bodyCount; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const jitter = (rng() - 0.5) * 2;

    bodies.push({
      type: 'dynamic',
      x: 120 + col * spacing + jitter,
      y: 100 - row * spacing,
      shape: { kind: 'box', width: BODY_SIZE, height: BODY_SIZE },
      density: 1,
      friction: 0.3,
      restitution: 0.1,
    });
  }
};

/**
 * `joint-chains`: `ceil(bodyCount / chainLength)` chains of dynamic boxes, each
 * hanging from its own static anchor and pinned link-to-link by revolute joints.
 *
 * The chains are laid out along X with a spacing wide enough that neighbouring
 * chains never touch, so the measured cost is constraint propagation along a
 * chain rather than contacts between chains. No RNG is consumed: a jittered
 * chain would swing differently per arm under identical solvers, and the
 * archetype is about the solver, not about the initial condition.
 */
const buildJointChains = (bodies: BodyDesc[], joints: JointDesc[], bodyCount: number, chainLength: number): void => {
  const length = Math.max(1, chainLength);
  const chains = Math.max(1, Math.ceil(bodyCount / length));
  const spacing = BODY_SIZE * 4;
  const anchorY = 200;
  const anchorIndices: number[] = [];

  // Statics first, exactly as every other scene: one anchor per chain.
  for (let chain = 0; chain < chains; chain++) {
    anchorIndices.push(bodies.length);
    bodies.push(staticBox(120 + chain * spacing, anchorY, BODY_SIZE, BODY_SIZE));
  }

  let placed = 0;

  for (let chain = 0; chain < chains && placed < bodyCount; chain++) {
    const x = 120 + chain * spacing;
    let previous = anchorIndices[chain]!;

    for (let link = 0; link < length && placed < bodyCount; link++) {
      const y = anchorY + (link + 1) * BODY_SIZE;
      const index = bodies.length;

      bodies.push({
        type: 'dynamic',
        x,
        y,
        shape: { kind: 'box', width: BODY_SIZE, height: BODY_SIZE },
        density: 1,
        friction: 0.5,
        restitution: DEFAULT_RESTITUTION,
      });

      // Pivot on the seam between the two links, so the chain hangs straight and
      // every joint starts at zero error - the same initial condition on all arms.
      joints.push({ bodyA: previous, bodyB: index, x, y: y - BODY_SIZE / 2 });
      previous = index;
      placed++;
    }
  }
};

/** World extent (px) each scene shape occupies, used to lay out the ray sweep across it. */
const sceneExtent = (shape: PhysicsSceneShape, bodyCount: number): { width: number; height: number } => {
  switch (shape) {
    case 'box-stack': {
      const columns = Math.max(1, Math.ceil(bodyCount / 8));

      return { width: columns * (BODY_SIZE + 6) + 200, height: 1_240 };
    }
    case 'many-dynamic': {
      const side = Math.ceil(Math.sqrt(bodyCount)) * (BODY_SIZE + 8) + 80;

      return { width: side, height: side };
    }
    case 'mixed-static-dynamic': {
      const columns = Math.max(1, Math.ceil(Math.sqrt(bodyCount)));

      return { width: columns * (BODY_SIZE + 10) + 200, height: 1_440 };
    }
    case 'joint-chains': {
      const chains = Math.max(1, Math.ceil(bodyCount / 8));

      return { width: 120 + chains * BODY_SIZE * 4 + 120, height: 1_000 };
    }
  }
};

/**
 * Ray `index` of `total` at step `step`, spanning the scene's extent.
 *
 * A CLOSED FORM in (index, step) rather than an accumulated or randomised path,
 * for the same reason the rendering camera path is one: warmup and timed steps
 * see one continuous sweep, a re-run casts the identical rays, and every arm
 * agrees without synchronising state.
 *
 * The rays fan from a moving origin on the left edge across the full extent, so
 * successive steps traverse different parts of the acceleration structure and no
 * arm can answer the sweep out of one cached traversal. `GOLDEN_STEP` advances
 * the origin by an irrational fraction of the height, so the sweep never falls
 * into a short repeating cycle.
 */
export const rayForStep = (index: number, total: number, step: number, extent: { readonly width: number; readonly height: number }): RayDesc => {
  const count = Math.max(1, total);
  const originY = extent.height * (((index / count + step * GOLDEN_STEP) % 1) + 0);
  // Fan across the full height of the far edge, so the sweep covers the extent
  // rather than a horizontal band.
  const targetY = extent.height * ((index + 1) / (count + 1));
  const dx = extent.width;
  const dy = targetY - originY;
  const length = Math.hypot(dx, dy) || 1;

  return { x: 0, y: originY, dx: dx / length, dy: dy / length, maxDistance: length };
};

/** Irrational per-step advance of the ray sweep's origin, as a fraction of the extent height. */
const GOLDEN_STEP = 0.618_033_988_749_895;

/**
 * Describe an archetype's scene as an engine-neutral body list, consuming the
 * shared RNG in the identical order the native exojs arm does so every arm
 * simulates the same bodies at the same positions with the same perturbations.
 *
 * The two RNG streams mirror `exojs-physics.ts` exactly: the perturbed-body set
 * is selected via {@link selectMutationIndices} on `createRng(seed)`, and body
 * placement/velocity jitter is drawn from an independent `createRng(seed ^
 * 0x5f356495)` stream - same seed, separate instance - so selection and
 * placement never share a stream position.
 */
export const describePhysicsScene = (spec: PhysicsArchetypeSpec, bodyCount: number, seed: number): SceneDescription => {
  const perturbed = selectMutationIndices(bodyCount, spec.perturbFraction, seed);
  const rng = createRng(seed ^ 0x5f35_6495);
  const bodies: BodyDesc[] = [];
  const joints: JointDesc[] = [];
  // A churning archetype reinterprets the perturbed selection as the churned set
  // (see `PhysicsArchetypeSpec.churn`), so the bodies are built WITHOUT an initial
  // impulse - they are replaced every step, and an impulse on a body that lives
  // one step is not a scene property.
  const impulsed = spec.churn === true ? [] : perturbed;

  switch (spec.scene) {
    case 'box-stack':
      buildBoxStack(bodies, bodyCount, rng);
      break;
    case 'many-dynamic':
      buildManyDynamic(bodies, bodyCount, rng, impulsed);
      break;
    case 'mixed-static-dynamic':
      buildMixed(bodies, bodyCount, rng);
      break;
    case 'joint-chains':
      buildJointChains(bodies, joints, bodyCount, spec.jointChainLength ?? 1);
      break;
  }

  return {
    bodies,
    perturbedSignature: mutationSignature(perturbed),
    dynamicOffset: bodies.findIndex(body => body.type === 'dynamic'),
    joints,
    churnIndices: spec.churn === true ? perturbed : [],
    extent: sceneExtent(spec.scene, bodyCount),
  };
};
