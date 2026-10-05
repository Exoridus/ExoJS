/**
 * The JSON-representable part of `value`, or `undefined` when nothing of it is.
 *
 * Plain objects and arrays are copied recursively; strings, booleans, finite
 * numbers and `null` pass through. Everything a JSON document cannot carry
 * faithfully - functions, symbols, `undefined`, non-finite numbers, and objects
 * with a prototype of their own (class instances, `Map`, typed arrays, DOM
 * objects) - is left out: an object property holding one is dropped, and an
 * array holding one is not representable as a whole, since dropping an element
 * would shift its neighbours.
 * @internal
 */
export const toPortableData = (value: unknown): unknown => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value !== 'object') {
    return undefined;
  }

  if (Array.isArray(value)) {
    const out: unknown[] = [];

    for (const element of value) {
      const portable = toPortableData(element);

      if (portable === undefined) {
        return undefined;
      }

      out.push(portable);
    }

    return out;
  }

  const prototype: unknown = Object.getPrototypeOf(value);

  if (prototype !== Object.prototype && prototype !== null) {
    return undefined;
  }

  const out: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    const portable = toPortableData(entry);

    if (portable !== undefined) {
      out[key] = portable;
    }
  }

  return out;
};

/**
 * JSON with object keys sorted at every level, so two values that differ only
 * in property order produce the same string. Expects portable data (see
 * {@link toPortableData}).
 * @internal
 */
export const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    // Code-unit order, not `localeCompare`: the string must not depend on the runtime's locale.
    const entries = Object.entries(value).sort(([left], [right]) => Number(left > right) - Number(left < right));

    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`;
  }

  return JSON.stringify(value);
};
