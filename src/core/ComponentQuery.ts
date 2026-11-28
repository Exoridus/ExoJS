import type { Component, ComponentClass } from './Component';
import type { ComponentRuntime } from './ComponentRuntime';
import type { SceneNode } from './SceneNode';

/** The component instances a {@link ComponentQuery} row carries, in the order the classes were given. */
export type ComponentQueryComponents<T extends readonly ComponentClass[]> = {
  readonly [K in keyof T]: T[K] extends ComponentClass<infer C> ? C : never;
};

/** One {@link ComponentQuery} match: the node, then its components in query order. */
export type ComponentQueryRow<T extends readonly ComponentClass[]> = readonly [SceneNode, ...ComponentQueryComponents<T>];

const staleIterationError = (): Error =>
  new Error(
    'ComponentQuery: an iteration was resumed after a frame boundary. Finish iterating within the frame (and never across an await); ' +
      'keep the query itself and start a new iteration instead.',
  );

/** Filters a derived query applies on top of its class tuple. */
interface QueryFilter {
  readonly active: boolean;
  readonly enabled: boolean;
  readonly without: readonly ComponentClass[];
  readonly where: ((node: SceneNode, components: readonly Component[]) => boolean) | null;
  readonly observer: ChangeCursor | null;
}

/** One change observer's position: changes stamped after `seen` are news to it. */
interface ChangeCursor {
  seen: number;
  /** Indices into the query's classes whose changes count, or `null` for all of them. */
  readonly watch: readonly number[] | null;
}

const noFilter: QueryFilter = { active: false, enabled: false, without: [], where: null, observer: null };

const sameTypes = (a: readonly ComponentClass[], b: readonly ComponentClass[]): boolean =>
  a.length === b.length && a.every((type, index) => type === b[index]);

const spread = (invoke: (...args: unknown[]) => unknown, node: SceneNode, components: readonly Component[]): unknown => {
  switch (components.length) {
    case 1:
      return invoke(node, components[0]);
    case 2:
      return invoke(node, components[0], components[1]);
    case 3:
      return invoke(node, components[0], components[1], components[2]);
    default:
      return invoke(node, ...components);
  }
};

const disposedError = (): Error =>
  new Error('ComponentQuery: the scene this query belongs to has ended. Make a new query on the scene that is active now.');

/**
 * A reusable, typed selection of the nodes in one scene that carry an exact
 * set of component classes. Obtained from {@link Scene.query}; the same class
 * tuple on the same scene returns the same query.
 *
 * A query selects; it runs nothing. Iterate it from a {@link System}, a
 * behaviour or a scene hook:
 *
 * ```ts
 * const movers = this.query(Velocity, Bounds);
 *
 * for (const [node, velocity, bounds] of movers) {
 *   node.x += velocity.x * delta;
 * }
 *
 * movers.forEach((node, velocity) => { ... }); // no row array per match
 * ```
 *
 * A match carries every requested class exactly - a subclass instance does
 * not match its base class. Disabled components and components of a paused or
 * retained scene match; narrow with {@link active}, {@link enabled},
 * {@link without} and {@link where}, which return derived queries over the
 * same index. Rows hold no `null`.
 *
 * ```ts
 * // In init(): derived queries are built once and reused every frame.
 * this.targets = this.query(Health, Bounds).active().without(Invulnerable);
 * this.healthBars = this.query(Health).changed();
 *
 * // In update():
 * this.healthBars.forEach((node, health) => bar.redraw(health.current));
 * ```
 *
 * A change observer ({@link changed}) lists only the matches whose components
 * reported a change with {@link Component.markChanged}, or joined the scene,
 * since that observer last completed a pass - so each consumer keeps its own
 * observer and none of them can take a change away from another. An observer
 * stores one number, never a list of changed components, whatever happens
 * between its passes.
 *
 * Each iteration works on the candidates that existed when it started:
 * members added meanwhile are not visited, and members removed or destroyed
 * meanwhile are skipped. Nested iterations are independent. A `for...of`
 * iteration must finish within the frame it started in - resuming it after the
 * frame boundary throws - and must not span an `await`, which the runtime
 * cannot always detect. Each `for...of` row is a fresh array; {@link forEach}
 * passes the components as arguments instead and allocates no row.
 *
 * Candidates come from an index per component class, never from walking the
 * scene graph: an iteration visits the nodes of the rarest requested class and
 * looks the others up on each of them.
 */
export class ComponentQuery<T extends readonly ComponentClass[]> implements Iterable<ComponentQueryRow<T>> {
  private readonly _runtime: ComponentRuntime;
  private readonly _types: T;
  private readonly _filter: QueryFilter | null;
  private _activeQuery: ComponentQuery<T> | null = null;
  private _enabledQuery: ComponentQuery<T> | null = null;
  private _withoutQueries: Array<ComponentQuery<T>> | null = null;

  /** Queries are made by {@link Scene.query}. @internal */
  public constructor(runtime: ComponentRuntime, types: T, filter: QueryFilter | null = null) {
    this._runtime = runtime;
    this._types = types;
    this._filter = filter;
  }

  /** The requested component classes, in row order. */
  public get types(): T {
    return this._types;
  }

  /**
   * The number of nodes matching right now. Counts by visiting the candidates,
   * so it costs as much as an iteration. Counting is not a pass: it consumes no
   * change of a {@link changed} observer.
   */
  public get size(): number {
    let count = 0;

    this._visit(() => {
      count++;
    }, false);

    return count;
  }

  /** The matches whose components are all {@link Component.active}. Cached: the same query each call. */
  public active(): ComponentQuery<T> {
    this._activeQuery ??= this._derive({ active: true });

    return this._activeQuery;
  }

  /** The matches whose components are all {@link Component.enabled}. Cached: the same query each call. */
  public enabled(): ComponentQuery<T> {
    this._enabledQuery ??= this._derive({ enabled: true });

    return this._enabledQuery;
  }

  /**
   * The matches whose node carries none of `types`, by exact class like the
   * query itself. Cached per class list: the same list returns the same query.
   */
  public without(...types: ComponentClass[]): ComponentQuery<T> {
    const without = [...(this._filter?.without ?? []), ...types];

    this._withoutQueries ??= [];

    for (const query of this._withoutQueries) {
      if (sameTypes(query._filter!.without, without)) {
        return query;
      }
    }

    const query = this._derive({ without });

    this._withoutQueries.push(query);

    return query;
  }

  /**
   * The matches `predicate` accepts, called with the node and its components
   * in query order. Not cached - build it once, outside the frame loop - and
   * keep the predicate free of side effects: it runs for every candidate of
   * every pass and of {@link size}.
   */
  public where(predicate: (node: SceneNode, ...components: ComponentQueryComponents<T>) => boolean): ComponentQuery<T> {
    const invoke = predicate as unknown as (...args: unknown[]) => unknown;
    const previous = this._filter?.where ?? null;

    return this._derive({
      where: (node, components) => (previous === null || previous(node, components)) && spread(invoke, node, components) === true,
    });
  }

  /**
   * A new, independent change observer over this query: each pass lists the
   * matches with a component that reported {@link Component.markChanged} or
   * joined the scene since the observer's previous completed pass. Its first
   * pass lists every match.
   *
   * `types` narrows which of the query's classes count; by default all do.
   *
   * A pass is consumed when it completes: a `forEach`, or a `for...of` that
   * ran to its end. A `for...of` left early with `break` consumes nothing, so
   * its next pass lists those matches again. A change reported while a pass
   * runs is listed by the next pass, whether or not this one already visited
   * the component. Nested passes of one observer cannot move it backwards: the
   * later-started pass decides how far it has seen.
   *
   * The other filters select which matches a pass lists, but a completed pass
   * consumes the changes of every candidate. A match the filters left out - a
   * disabled component, a node `where` rejected - is not news to a later pass
   * just because the filters accept it now; call {@link Component.markChanged}
   * when entering the selection should count as a change.
   */
  public changed(...types: Array<T[number]>): ComponentQuery<T> {
    const watch = types.length === 0 ? null : types.map(type => this._types.indexOf(type)).filter(index => index !== -1);

    return this._derive({ observer: { seen: 0, watch } });
  }

  public *[Symbol.iterator](): Iterator<ComponentQueryRow<T>> {
    const runtime = this._assertLive();
    const generation = runtime.generation;
    const stamp = runtime.stamp;
    const driver = this._driver(runtime);

    if (driver === null) {
      this._consume(stamp);

      return;
    }

    for (const node of driver) {
      if (runtime.generation !== generation) {
        throw staleIterationError();
      }

      const row = this._row(runtime, node, stamp);

      if (row === null) {
        continue;
      }

      yield row;

      if (runtime.generation !== generation) {
        throw staleIterationError();
      }
    }

    this._consume(stamp);
  }

  /**
   * Call `callback` for every match, with the node and its components as
   * arguments in query order. Allocates no row per match, which makes it the
   * form for per-frame loops.
   */
  public forEach(callback: (node: SceneNode, ...components: ComponentQueryComponents<T>) => void): void {
    const invoke = callback as unknown as (...args: unknown[]) => void;

    this._visit((node, components) => {
      spread(invoke, node, components);
    }, true);
  }

  /** Whether this query was made for exactly `types`. @internal */
  public _matches(types: readonly ComponentClass[]): boolean {
    if (types.length !== this._types.length) {
      return false;
    }

    for (let i = 0; i < types.length; i++) {
      if (types[i] !== this._types[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Visit every match with a component array reused across matches - only the
   * synchronous callers that never keep it use this.
   */
  private _visit(visit: (node: SceneNode, components: readonly Component[]) => void, consume: boolean): void {
    const runtime = this._assertLive();
    const stamp = runtime.stamp;
    const driver = this._driver(runtime);

    if (driver === null) {
      if (consume) {
        this._consume(stamp);
      }

      return;
    }

    const types = this._types;
    const components: Component[] = new Array<Component>(types.length);

    // A snapshot of the driver's members would cost an array per call; the
    // stamp check below gives the same "candidates as of the start" view, and a
    // Set iteration already skips entries deleted while it runs.
    for (const node of driver) {
      let matched = true;

      for (let i = 0; i < types.length; i++) {
        const component = node._componentOf(types[i]!);

        if (!runtime.isVisible(component, stamp)) {
          matched = false;
          break;
        }

        components[i] = component!;
      }

      if (matched && (this._filter === null || this._accepts(runtime, node, components, stamp))) {
        visit(node, components);
      }
    }

    if (consume) {
      this._consume(stamp);
    }
  }

  private _row(runtime: ComponentRuntime, node: SceneNode, stamp: number): ComponentQueryRow<T> | null {
    const types = this._types;
    const row: unknown[] = [node];

    for (const type of types) {
      const component = node._componentOf(type);

      if (!runtime.isVisible(component, stamp)) {
        return null;
      }

      row.push(component);
    }

    if (this._filter !== null && !this._accepts(runtime, node, row.slice(1) as Component[], stamp)) {
      return null;
    }

    return row as unknown as ComponentQueryRow<T>;
  }

  /** Whether a candidate carrying every requested class passes this query's filters. */
  private _accepts(runtime: ComponentRuntime, node: SceneNode, components: readonly Component[], stamp: number): boolean {
    const filter = this._filter!;

    if (filter.active || filter.enabled) {
      for (const component of components) {
        if ((filter.active && !component.active) || (filter.enabled && !component.enabled)) {
          return false;
        }
      }
    }

    for (const type of filter.without) {
      if (runtime.isVisible(node._componentOf(type), stamp)) {
        return false;
      }
    }

    const observer = filter.observer;

    if (observer !== null && !isNews(observer, components)) {
      return false;
    }

    return filter.where === null || filter.where(node, components);
  }

  private _derive(change: Partial<QueryFilter>): ComponentQuery<T> {
    const base = this._filter ?? noFilter;
    // A derived query never shares a cursor: two queries consuming one cursor would take changes from each other.
    const observer = change.observer ?? (base.observer === null ? null : { ...base.observer });

    return new ComponentQuery<T>(this._runtime, this._types, { ...base, ...change, observer });
  }

  /** A completed pass that started at `stamp` has seen every change up to it. */
  private _consume(stamp: number): void {
    const observer = this._filter?.observer;

    if (observer != null && stamp > observer.seen) {
      observer.seen = stamp;
    }
  }

  /** The smallest index among the requested classes, or `null` when one of them has no member at all. */
  private _driver(runtime: ComponentRuntime): ReadonlySet<SceneNode> | null {
    let smallest: ReadonlySet<SceneNode> | null = null;

    for (const type of this._types) {
      const nodes = runtime.nodesOf(type);

      if (nodes === undefined || nodes.size === 0) {
        return null;
      }

      if (smallest === null || nodes.size < smallest.size) {
        smallest = nodes;
      }
    }

    return smallest;
  }

  private _assertLive(): ComponentRuntime {
    if (this._runtime.disposed) {
      throw disposedError();
    }

    return this._runtime;
  }
}

const isNews = (observer: ChangeCursor, components: readonly Component[]): boolean => {
  const { seen, watch } = observer;

  if (watch === null) {
    for (const component of components) {
      if (component._joinStamp > seen || component._changeStamp > seen) {
        return true;
      }
    }

    return false;
  }

  for (const index of watch) {
    const component = components[index]!;

    if (component._joinStamp > seen || component._changeStamp > seen) {
      return true;
    }
  }

  return false;
};
