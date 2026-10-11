import { BehaviorComponent, type PointLike, type Seconds, Signal, Time, Vector } from '@codexo/exojs';

import { Pathfinder } from '../Pathfinder';
import type { FindPathOptions, NavigationSpace, PathResult } from '../types';
import type { NavigationMovement } from './NavigationMovement';

/**
 * Where a {@link NavigationAgentComponent} stands.
 *
 * - `idle` - no destination; the state before the first command and after
 *   {@link NavigationAgentComponent.stop}.
 * - `navigating` - following a route, including a partial one that a search
 *   budget cut short.
 * - `arrived` - within `arrivalDistance` of the destination. A followed target
 *   that moves away puts the agent back to `navigating`.
 * - `unreachable` - no route leads to the destination, or the agent has
 *   reached the closest point a `snapToNearest` search could offer.
 * - `blocked` - a route exists, but the movement made no progress along it
 *   even after a fresh search.
 *
 * `unreachable` and `blocked` are retried on their own when the space's
 * revision changes or a followed target moves to another node.
 */
export type NavigationStatus = 'idle' | 'navigating' | 'arrived' | 'unreachable' | 'blocked';

/** Construction options for {@link NavigationAgentComponent}. */
export interface NavigationAgentOptions<Payload = unknown> {
  /** The space routes are searched in. Any {@link NavigationSpace} works. */
  readonly space: NavigationSpace<Payload>;
  /** Carries out the motion the agent asks for. */
  readonly movement: NavigationMovement;
  /**
   * The agent's live position in navigation space, read every fixed step - a
   * physics body, a vector the game keeps up to date, or an object with
   * `x`/`y` getters that convert from another space. Defaults to the node's
   * own `x`/`y`, which only matches navigation space for a node whose parent
   * applies no transform and whose position is not a projection.
   */
  readonly position?: Readonly<PointLike> | undefined;
  /**
   * Runs the searches. Defaults to one pathfinder shared by every agent that
   * does not name its own: searches never interleave, so sharing only saves
   * the per-pathfinder buffers.
   */
  readonly pathfinder?: Pathfinder | undefined;
  /** Search options for every route the agent plans. */
  readonly search?: FindPathOptions | undefined;
  /**
   * Distance from the destination, in navigation units, at which the agent
   * counts as arrived. Raise it when the actor cannot reach the destination
   * point itself - a body stopped by the target's own collider, a destination
   * closer to a wall than the actor's radius. Defaults to `0`: the agent steers
   * onto the destination exactly.
   */
  readonly arrivalDistance?: number | undefined;
  /**
   * Shortest time between two searches the agent starts on its own - for a
   * followed target changing node, a space revision, the end of a partial
   * route or missing progress. It also sets how long the agent watches for
   * progress before it decides it is stuck. A new command searches at once.
   * Defaults to a quarter second.
   */
  readonly repathInterval?: Seconds | undefined;
}

/** Fraction of the commanded travel below which a window counts as no progress. */
const minProgress = 0.1;

/** Rounding slack for "standing on the destination" when `arrivalDistance` is `0`. */
const arrivalEpsilon = 1e-6;

/**
 * Spreads automatic searches of agents that react to one event - a target
 * many of them follow changing node - over up to one extra interval, by a
 * low-discrepancy phase per agent, instead of running them all in one step.
 */
const phaseStep = 0.618_033_988_75;

let agentSerial = 0;
let sharedPathfinder: Pathfinder | null = null;

/**
 * Moves its actor to a destination, or after a moving target, through any
 * {@link NavigationSpace}: it plans the route, progresses along its
 * waypoints, slows down onto the destination, notices when the route goes
 * stale and plans again.
 *
 * The agent decides where to go; a {@link NavigationMovement} performs the
 * motion. The agent never touches the actor's transform itself, so the same
 * agent drives a physics-backed movement, one that writes a node position, or
 * one the game provides. Positions, destinations and targets are all read in
 * the navigation space's coordinates.
 *
 * The agent steers in its fixed update, which a scene runs before its
 * systems, so a movement backed by a physics world registered as a scene
 * system receives each step's command before that world steps. Nothing is
 * searched every step: a route is planned on a new command and replanned only
 * when it went stale - the space's revision changed, a followed target moved
 * to another node, a budget-limited partial route ran out, or the actor made
 * no progress - and automatic replans are at most one per
 * {@link NavigationAgentOptions.repathInterval}.
 *
 * Disabling the agent stops the movement and keeps the command; enabling it
 * again plans a fresh route to it. Pausing the scene pauses the agent.
 *
 * @example
 * ```ts
 * const agent = zombie.addComponent(new NavigationAgentComponent({ space: navigation, movement, position: physics.body }));
 *
 * agent.moveTo({ x: 500, y: 300 });
 * agent.follow(player.getComponent(PhysicsBodyComponent)!.body);
 * agent.onStatusChange.add(status => console.log(status));
 * agent.stop();
 * ```
 */
export class NavigationAgentComponent<Payload = unknown> extends BehaviorComponent {
  /** Fires with the new status whenever {@link status} changes. */
  public readonly onStatusChange = new Signal<[status: NavigationStatus]>();
  public readonly space: NavigationSpace<Payload>;
  public readonly movement: NavigationMovement;
  public readonly pathfinder: Pathfinder;

  private readonly _position: Readonly<PointLike> | null;
  private readonly _search: FindPathOptions;
  private readonly _arrivalDistance: number;
  private readonly _repathInterval: number;
  private readonly _phase: number;
  private readonly _destination = new Vector();
  private readonly _direction = new Vector();
  private readonly _aim = new Vector();
  private _target: Readonly<PointLike> | null = null;
  private _hasGoal = false;
  private _status: NavigationStatus = 'idle';
  private _path: PathResult<Payload> | null = null;
  private _waypoint = 0;
  private _reachesGoal = false;
  private _plannedGoalNode = -1;
  private _plannedRevision = -1;
  private _replanRequested = false;
  private _clock = 0;
  private _lastPlanTime = -Infinity;
  private _pendingSince = -1;
  private _progressStart = 0;
  private _progressX = 0;
  private _progressY = 0;
  private _commandedTravel = 0;
  private _stalled = false;
  private _stallRetry = false;
  private _steering = false;

  /** @throws RangeError for a negative or non-finite `arrivalDistance` or `repathInterval`. */
  public constructor(options: NavigationAgentOptions<Payload>) {
    super();

    const arrivalDistance = options.arrivalDistance ?? 0;
    const repathInterval = options.repathInterval ?? Time.seconds(0.25);

    if (!Number.isFinite(arrivalDistance) || arrivalDistance < 0) {
      throw new RangeError(`NavigationAgentComponent: arrivalDistance must be finite and non-negative, received ${arrivalDistance}.`);
    }

    if (!Number.isFinite(repathInterval) || repathInterval < 0) {
      throw new RangeError(`NavigationAgentComponent: repathInterval must be finite and non-negative, received ${repathInterval}.`);
    }

    this.space = options.space;
    this.movement = options.movement;
    this.pathfinder = options.pathfinder ?? (sharedPathfinder ??= new Pathfinder());
    this._position = options.position ?? null;
    this._search = { ...options.search };
    this._arrivalDistance = arrivalDistance;
    this._repathInterval = repathInterval;
    this._phase = (agentSerial++ * phaseStep) % 1;
  }

  public get status(): NavigationStatus {
    return this._status;
  }

  /** The route being followed, or `null` before the first search and after {@link stop}. */
  public get path(): PathResult<Payload> | null {
    return this._path;
  }

  /** Index into {@link path}'s points of the waypoint the agent is heading for. */
  public get waypointIndex(): number {
    return this._waypoint;
  }

  /**
   * Where the agent is going: the fixed destination, or the followed target's
   * position when it was last read. `null` while idle.
   */
  public get destination(): Readonly<Vector> | null {
    return this._hasGoal ? this._destination : null;
  }

  /** The followed target, or `null` when navigating to a fixed destination or idle. */
  public get target(): Readonly<PointLike> | null {
    return this._target;
  }

  /**
   * Navigates to a fixed point, which is copied. A destination in the node the
   * current route already ends in reuses the route; any other one is searched
   * in the next fixed step.
   */
  public moveTo(destination: Readonly<PointLike>): void {
    this._target = null;
    this._setGoal(destination.x, destination.y);
  }

  /**
   * Follows a target whose position is read live every fixed step - a
   * physics body, a node in navigation coordinates, any object with `x`/`y`.
   * The route is replanned when the target enters another node, and the
   * agent steers onto the target itself once they share the final node.
   * Following continues after arrival until {@link stop} or another command.
   */
  public follow(target: Readonly<PointLike>): void {
    this._target = target;
    this._setGoal(target.x, target.y);
  }

  /** Cancels navigation: the agent becomes `idle` and the movement is stopped. */
  public stop(): void {
    const wasActive = this._hasGoal;

    this._target = null;
    this._hasGoal = false;
    this._path = null;
    this._replanRequested = false;
    this._pendingSince = -1;
    this._halt();

    if (wasActive || this._status !== 'idle') {
      this._setStatus('idle');
    }
  }

  /** Plans a fresh route in the next fixed step, regardless of the repath interval. */
  public repath(): void {
    if (this._hasGoal) {
      this._replanRequested = true;
    }
  }

  public override fixedUpdate(step: Seconds): void {
    this._clock += step;

    if (!this._hasGoal) {
      return;
    }

    const position = this._position ?? this.node;
    const x = position.x;
    const y = position.y;

    if (this._target !== null) {
      this._destination.set(this._target.x, this._target.y);
    }

    if (this._replanRequested) {
      this._plan(x, y);
    } else if (this._needsReplan()) {
      if (this._pendingSince < 0) {
        this._pendingSince = this._clock;
      }

      if (
        this._clock - this._lastPlanTime >= this._repathInterval &&
        this._clock - this._pendingSince >= this._phase * this._repathInterval
      ) {
        this._plan(x, y);
      }
    } else {
      this._pendingSince = -1;
    }

    if (this._status === 'navigating' || this._status === 'arrived') {
      this._steer(x, y, step);
    }
  }

  protected override onEnable(): void {
    this.repath();
  }

  protected override onDisable(): void {
    this._halt();
  }

  protected override onDestroy(): void {
    this._target = null;
    this._path = null;
    this._hasGoal = false;
    this.onStatusChange.destroy();
  }

  private _setGoal(x: number, y: number): void {
    const node = this._nodeAt(x, y);
    const resumable = (this._status === 'navigating' || this._status === 'arrived') && node === this._plannedGoalNode;

    this._destination.set(x, y);
    this._hasGoal = true;
    this._pendingSince = -1;
    // A goal inside the node the route already ends in needs no new search:
    // the route still leads there, and steering reads the exact point.
    this._replanRequested = !resumable;

    if (resumable && this._status === 'arrived') {
      this._setStatus('navigating');
    }
  }

  /** Whether the current route went stale since it was planned. */
  private _needsReplan(): boolean {
    const goalMoved = this._target !== null && this._goalMoved();

    if (this._status === 'arrived' || goalMoved) {
      return goalMoved;
    }

    if (this.space.revision !== this._plannedRevision) {
      return true;
    }

    if (this._status !== 'navigating') {
      return false;
    }

    const path = this._path!;

    return this._stalled || (path.status === 'budget-exceeded' && this._waypoint >= path.points.length - 1);
  }

  /** Whether the destination is now in another node than the one the route was planned to. */
  private _goalMoved(): boolean {
    return this._nodeAt(this._destination.x, this._destination.y) !== this._plannedGoalNode;
  }

  private _plan(x: number, y: number): void {
    const goalX = this._destination.x;
    const goalY = this._destination.y;
    const stalled = this._stalled && !this._replanRequested;
    const result = this.pathfinder.findPathBetween(this.space, x, y, goalX, goalY, this._search);
    const nodes = result.nodes;

    this._path = result;
    this._plannedRevision = result.revision;
    this._plannedGoalNode = this._nodeAt(goalX, goalY);
    this._reachesGoal = result.status === 'found' && nodes.length > 0 && nodes[nodes.length - 1] === this._plannedGoalNode;
    this._waypoint = result.points.length > 1 ? 1 : 0;
    this._lastPlanTime = this._clock;
    this._pendingSince = -1;
    this._replanRequested = false;
    this._resetProgress(x, y);
    // A route planned because the last one made no progress gets one window to
    // do better; failing that, the agent reports `blocked` instead of
    // searching again and again from the same spot.
    this._stalled = false;
    this._stallRetry = stalled;

    // A budget too small to get past the start leaves nothing to walk, and
    // searching again from the same spot would end the same way.
    if (result.status === 'unreachable' || (result.status === 'budget-exceeded' && nodes.length <= 1)) {
      this._halt();
      this._setStatus('unreachable');

      return;
    }

    this._setStatus('navigating');
  }

  private _steer(x: number, y: number, step: Seconds): void {
    const points = this._path!.points;
    const last = points.length - 1;
    const maxSpeed = this.movement.maxSpeed;
    const stepDistance = maxSpeed * step;

    const aim = this._aim;

    let distance: number;

    for (;;) {
      this._aimAtWaypoint(points, last, aim);
      distance = Math.hypot(aim.x - x, aim.y - y);

      // Passing a waypoint within this step's reach turns toward the next one
      // now, rather than spending a slowed step landing on the corner.
      if (this._waypoint >= last || distance > stepDistance) {
        break;
      }

      this._waypoint++;
    }

    const final = this._waypoint >= last;

    if (final && distance <= this._arrivalDistance + arrivalEpsilon) {
      this._reachEnd();

      return;
    }

    // A followed target that left the node the route ends in is no longer at
    // the route's end; walking on to that end would lead away from it. The
    // replan it triggered arrives within the repath interval.
    if (final && this._reachesGoal && this._goalMoved()) {
      this._halt();

      return;
    }

    if (this._status === 'arrived') {
      this._setStatus('navigating');
    }

    const magnitude = final && stepDistance > distance ? distance / stepDistance : 1;

    this._direction.set(((aim.x - x) / distance) * magnitude, ((aim.y - y) / distance) * magnitude);
    this._trackProgress(x, y, stepDistance * magnitude);
    this._steering = true;
    this.movement.move(this._direction, step);
  }

  /**
   * The point to steer for at the current waypoint: the route's own point, or
   * the exact destination once on the final one - provided the route ends in
   * the node the destination is in now, so steering never leaves the route.
   */
  private _aimAtWaypoint(points: readonly Vector[], last: number, out: Vector): void {
    if (this._waypoint >= last && this._reachesGoal && !this._goalMoved()) {
      out.copy(this._destination);
    } else {
      out.copy(points[Math.min(this._waypoint, last)]!);
    }
  }

  private _reachEnd(): void {
    const path = this._path!;

    this._halt();

    if (this._reachesGoal) {
      this._setStatus('arrived');
    } else if (path.status === 'budget-exceeded') {
      // The end of a partial route is only a stepping stone; the replan
      // trigger picks it up within the repath interval.
      this._waypoint = path.points.length - 1;
    } else {
      this._setStatus('unreachable');
    }
  }

  private _trackProgress(x: number, y: number, travel: number): void {
    this._commandedTravel += travel;

    if (this._clock - this._progressStart < this._repathInterval || this._commandedTravel <= 0) {
      return;
    }

    const moved = Math.hypot(x - this._progressX, y - this._progressY);

    if (moved >= this._commandedTravel * minProgress) {
      this._stallRetry = false;
    } else if (this._stallRetry) {
      this._stallRetry = false;
      this._halt();
      this._setStatus('blocked');
    } else {
      this._stalled = true;
    }

    this._resetProgress(x, y);
  }

  private _resetProgress(x: number, y: number): void {
    this._progressStart = this._clock;
    this._progressX = x;
    this._progressY = y;
    this._commandedTravel = 0;
  }

  private _nodeAt(x: number, y: number): number {
    const space = this.space;
    const node = space.pointToNode(x, y);

    return node < 0 && space.nearestNode !== undefined ? space.nearestNode(x, y) : node;
  }

  private _halt(): void {
    if (this._steering) {
      this._steering = false;
      this.movement.stop();
    }
  }

  private _setStatus(status: NavigationStatus): void {
    if (this._status === status) {
      return;
    }

    this._status = status;
    this.onStatusChange.dispatch(status);
  }
}
