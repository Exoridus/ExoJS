/**
 * Static method a scene-node class declares when JSX cannot pass its props to
 * the constructor as one options object, for example because the constructor
 * takes a texture or a string first. Classes whose constructor takes nothing or
 * a single options object need no adapter.
 *
 * JSX calls `Class[jsxConstruct](props)` with every prop except `children`,
 * `ref`, the shared node properties and the signal handlers, and expects a new
 * instance back. The node property names are reserved, so an option that shares
 * one needs a different prop name, as `BitmapText`'s `fontScale` does. Type the parameter with {@link JsxAdapterProps} and construct
 * with `new this(...)`, so a subclass that keeps the constructor signature
 * inherits the adapter:
 *
 * ```ts
 * class Badge extends Container {
 *   public constructor(public readonly rank: number) { super(); }
 *
 *   public static [jsxConstruct](props: JsxAdapterProps<{ readonly rank: number }>): Badge {
 *     return new this(props.rank);
 *   }
 * }
 * ```
 *
 * A first adapter in a class hierarchy may also declare `this` as the
 * constructor type it calls, as `Sprite` does. JSX then rejects a subclass whose
 * constructor no longer fits until that subclass declares its own adapter,
 * which omits `this`.
 */
export const jsxConstruct: unique symbol = Symbol('jsxConstruct');
