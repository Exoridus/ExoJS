// @codexo/exojs/jsx-dev-runtime - the development variant of the automatic
// JSX transform. Elements are built exactly as in production; the extra
// arguments the compiler passes (key, static flag, source location) are unused.

import { jsx } from './jsx';

export { Fragment } from './jsx';
export type { JSX } from './types';

/** Development entry of the automatic JSX transform; builds the element exactly like {@link jsx}. */
// eslint-disable-next-line @typescript-eslint/naming-convention -- the name the automatic transform imports
export const jsxDEV = (type: unknown, props: Readonly<Record<string, unknown>>): ReturnType<typeof jsx> => jsx(type, props);
