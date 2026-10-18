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
 * retained scene match; check {@link Component.enabled} or
 * {@link Component.active} where a task needs to. Rows hold no `null`.
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

  /** Queries are made by {@link Scene.query}. @internal */
  public constructor(runtime: ComponentRuntime, types: T) {
    this._runtime = runtime;
    this._types = types;
  }

  /** The requested component classes, in row order. */
  public get types(): T {
    return this._types;
  }

  /**
   * The number of nodes matching right now. Counts by visiting the candidates,
   * so it costs as much as an iteration.
   */
  public get size(): number {
    let count = 0;

    this._visit(() => {
      count++;
    });

    return count;
  }

  public *[Symbol.iterator](): Iterator<ComponentQueryRow<T>> {
    const runtime = this._assertLive();
    const generation = runtime.generation;
    const stamp = runtime.stamp;
    const driver = this._driver(runtime);

    if (driver === null) {
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
  }

  /**
   * Call `callback` for every match, with the node and its components as
   * arguments in query order. Allocates no row per match, which makes it the
   * form for per-frame loops.
   */
  public forEach(callback: (node: SceneNode, ...components: ComponentQueryComponents<T>) => void): void {
    const invoke = callback as unknown as (...args: unknown[]) => void;

    this._visit((node, components) => {
      switch (components.length) {
        case 1:
          invoke(node, components[0]);
          break;
        case 2:
          invoke(node, components[0], components[1]);
          break;
        case 3:
          invoke(node, components[0], components[1], components[2]);
          break;
        default:
          invoke(node, ...components);
      }
    });
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
  private _visit(visit: (node: SceneNode, components: readonly Component[]) => void): void {
    const runtime = this._assertLive();
    const stamp = runtime.stamp;
    const driver = this._driver(runtime);

    if (driver === null) {
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

      if (matched) {
        visit(node, components);
      }
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

    return row as unknown as ComponentQueryRow<T>;
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
