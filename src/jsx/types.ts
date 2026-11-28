import type { Color } from '#core/Color';
import type { Signal } from '#core/Signal';
import type { Container } from '#rendering/Container';
import type { Drawable } from '#rendering/Drawable';
import type { RenderNode } from '#rendering/RenderNode';
import type { BlendModes } from '#rendering/types';

import type { jsxConstruct } from './jsxConstruct';

/**
 * What a JSX child position may hold: a scene node, a list of children, or
 * `null`, `undefined`, `true` or `false`, which add nothing. Strings and
 * numbers are not children; pass text through a prop such as `text`.
 */
export type JsxChildren = RenderNode | boolean | null | undefined | readonly JsxChildren[];

/** A concrete scene-node class JSX can construct. */
export type JsxNodeClass<I extends RenderNode = RenderNode> = new (...args: never[]) => I;

/** A function JSX calls with its props: `<MainMenu title="Paused" />`. */
export type JsxFunction<P = never> = (props: P) => RenderNode;

/** A point given as one number for both axes or as an `{ x, y }` pair. */
export type JsxVectorInput = number | { readonly x: number; readonly y: number };

/**
 * Scene-graph properties every element accepts. JSX assigns each one through
 * the node's own property or setter after the constructor ran.
 */
export interface JsxNodeProps {
  readonly name?: string | null;
  readonly x?: number;
  readonly y?: number;
  /** In degrees, like {@link SceneNode.rotation}. */
  readonly rotation?: number;
  readonly scale?: JsxVectorInput;
  readonly origin?: JsxVectorInput;
  readonly skewX?: number;
  readonly skewY?: number;
  readonly visible?: boolean;
  readonly zIndex?: number;
  readonly interactive?: boolean;
  readonly draggable?: boolean;
  readonly cursor?: string | null;
  readonly focusable?: boolean;
  readonly tabIndex?: number;
  readonly hitArea?: RenderNode['hitArea'];
  readonly filters?: RenderNode['filters'];
  readonly mask?: RenderNode['mask'];
  readonly cullable?: boolean;
}

/** Properties a {@link Drawable} element accepts in addition to {@link JsxNodeProps}. */
export interface JsxDrawableProps {
  readonly tint?: Color;
  readonly blendMode?: BlendModes;
  readonly anchor?: JsxVectorInput;
}

type SignalArgs<S> = S extends Signal<infer Args> ? Args : never;

/**
 * One optional handler prop per `on*` signal of the instance type: the handler
 * is added to that signal with {@link Signal.add} and receives its arguments.
 */
export type JsxSignalProps<I> = {
  readonly [K in keyof I as K extends `on${Capitalize<string>}` ? ([SignalArgs<I[K]>] extends [never] ? never : K) : never]?: (
    ...args: SignalArgs<I[K]>
  ) => void;
};

/**
 * Reported as a missing property when a class cannot be constructed from JSX
 * as it is: its constructor takes more than one argument, or a first argument
 * that is not an options object, and it declares no {@link jsxConstruct}
 * adapter for that signature.
 */
export interface JsxAdapterRequired {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the name is the diagnostic a compiler prints
  readonly 'static [jsxConstruct](props) adapter required': never;
}

/**
 * The props parameter of a {@link jsxConstruct} adapter: the props it reads,
 * open to further keys. The open signature keeps adapters of a base class and
 * of its subclasses compatible however different their props are; the element
 * props a compiler checks are `P` alone.
 */
export type JsxAdapterProps<P> = P & Readonly<Record<string, unknown>>;

type WithoutIndex<P> = { [K in keyof P as string extends K ? never : number extends K ? never : K]: P[K] };

type AdapterProps<C> = C extends { [jsxConstruct](this: infer Self, props: infer P): unknown }
  ? C extends Self
    ? WithoutIndex<P>
    : JsxAdapterRequired
  : never;

type OptionsProps<C> = C extends new (...args: infer A) => unknown
  ? A extends []
    ? Record<never, never>
    : A extends [(infer O)?]
      ? Exclude<O, undefined> extends object
        ? Exclude<O, undefined>
        : JsxAdapterRequired
      : JsxAdapterRequired
  : never;

/**
 * The props a class constructs from: its {@link jsxConstruct} adapter's props,
 * else the options object its constructor takes.
 */
export type JsxConstructionProps<C> = typeof jsxConstruct extends keyof C ? AdapterProps<C> : OptionsProps<C>;

type ReservedName<C extends JsxNodeClass> = Extract<
  keyof JsxConstructionProps<C>,
  | keyof JsxNodeProps
  | (InstanceType<C> extends Drawable ? keyof JsxDrawableProps : never)
  | `on${Capitalize<string>}`
  | 'children'
  | 'ref'
  | 'key'
>;

/**
 * Reported in place of the construction props when a class's options use a
 * name JSX reserves: a node property, which JSX assigns through its setter, an
 * `on*` name, which JSX treats as a signal handler, or `children`, `ref` or
 * `key`, which the compiler and JSX consume. Either way the constructor would
 * never receive the value. Give the option another prop name
 * in a {@link jsxConstruct} adapter.
 */
export interface JsxReservedOptionName<Names> {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the name is the diagnostic a compiler prints
  readonly 'option names reserved by JSX for node properties and signal handlers': Names;
}

/** The `children` prop: containers take {@link JsxChildren}, every other node none. */
export type JsxChildrenProp<I> = I extends Container ? { readonly children?: JsxChildren } : { readonly children?: never };

/**
 * Everything an element of class `C` accepts: its construction props, the
 * shared node properties, its signal handlers, children when it is a container,
 * and an optional `ref` called with the finished instance.
 */
export type JsxElementProps<C extends JsxNodeClass> = ([ReservedName<C>] extends [never]
  ? JsxConstructionProps<C>
  : JsxReservedOptionName<ReservedName<C>>) &
  JsxNodeProps &
  (InstanceType<C> extends Drawable ? JsxDrawableProps : Record<never, never>) &
  Omit<JsxSignalProps<InstanceType<C>>, keyof JsxConstructionProps<C>> &
  JsxChildrenProp<InstanceType<C>> & {
    /**
     * Called once with the instance after it and its children were built and
     * attached. A later failure in an enclosing element detaches the instance
     * but does not destroy it, unless the tree is built in a
     * {@link jsxTransaction}.
     */
    readonly ref?: (instance: InstanceType<C>) => void;
  };

/**
 * The JSX type contract of `@codexo/exojs/jsx-runtime`. Every JSX expression
 * has the type {@link JSX.Element}, a {@link RenderNode}: TypeScript gives all
 * JSX expressions one common type, so `<Panel />` is not typed as `Panel`.
 * Keep the instance from `new Panel()` or a `ref` where the concrete type
 * matters.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace -- the automatic transform looks up a namespace named JSX
export declare namespace JSX {
  /** The type of every JSX expression. */
  type Element = RenderNode;
  /** What may appear as a tag: a scene-node class or a function returning a node. */
  type ElementType = JsxNodeClass | JsxFunction;
  // A single member names the prop that receives JSX children; its type is irrelevant.
  interface ElementChildrenAttribute {
    children: unknown;
  }
  /** ExoJS has no intrinsic (lowercase) elements. */
  type IntrinsicElements = Record<never, never>;
  /** Computes the props of a class element; a function element takes the type of its first parameter. */
  type LibraryManagedAttributes<C, P> = C extends JsxNodeClass ? JsxElementProps<C> : P;
}
