import type { FontWeight } from '#rendering/text/TextStyle';
import type { TextAlignment } from '#rendering/text/types';
import type { RepeatFit, RepeatMode } from '#rendering/texture/repeat';

import type { SerializedNode } from './types';

/**
 * Validating read helpers for deserialization — **check instead of cast**.
 *
 * Deserialized JSON is treated as untrusted input (it may come from a save
 * file, cloud sync, shared prefab, or user-generated content). Every field
 * access goes through one of these helpers so a manipulated or corrupt document
 * can only ever cause a field to be *ignored* (falling back to the constructor
 * default) — never to inject an unchecked value of the wrong type/domain into
 * the engine. Structural top-level errors are rejected at the boundary
 * (`migrate` / `Scene.deserialize`); per-field garbage degrades to defaults.
 *
 * The `read*` helpers take `(data, key)` for field access; the `as*` helpers
 * narrow an already-extracted value (used for nested elements).
 *
 * @internal
 */

type Data = Record<string, unknown>;

/** Read a string field; `fallback` (or `undefined`) when absent or not a string. */
export function readString(data: Data, key: string): string | undefined;
export function readString(data: Data, key: string, fallback: string): string;
export function readString(data: Data, key: string, fallback?: string): string | undefined {
  const value = data[key];

  return typeof value === 'string' ? value : fallback;
}

/**
 * Read a finite-number field; `fallback` (or `undefined`) when absent, not a
 * number, or non-finite. The finite check rejects `NaN`/`Infinity` smuggled in
 * through a hand-edited document.
 */
export function readNumber(data: Data, key: string): number | undefined;
export function readNumber(data: Data, key: string, fallback: number): number;
export function readNumber(data: Data, key: string, fallback?: number): number | undefined {
  const value = data[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Read a boolean field; `fallback` (or `undefined`) when absent or not a boolean. */
export function readBoolean(data: Data, key: string): boolean | undefined;
export function readBoolean(data: Data, key: string, fallback: boolean): boolean;
export function readBoolean(data: Data, key: string, fallback?: boolean): boolean | undefined {
  const value = data[key];

  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Read a string field constrained to `allowed`; `fallback` (or `undefined`)
 * when absent or not a member. The cast is performed **after** the runtime
 * membership check, so it is sound — this is the helper that replaces the bare
 * `data.x as SomeEnum` casts.
 */
export function readEnum<T extends string>(data: Data, key: string, allowed: readonly T[]): T | undefined;
export function readEnum<T extends string>(data: Data, key: string, allowed: readonly T[], fallback: T): T;
export function readEnum<T extends string>(data: Data, key: string, allowed: readonly T[], fallback?: T): T | undefined {
  const value = data[key];

  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Read an object-valued (non-array) field as a record, or `undefined`. */
export function readObject(data: Data, key: string): Data | undefined {
  return asObject(data[key]) ?? undefined;
}

/** Narrow an already-extracted value to a plain object record, or `null`. */
export function asObject(value: unknown): Data | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Data) : null;
}

/**
 * Narrow an already-extracted value to a {@link SerializedNode} (an object
 * carrying a string `type` tag), or `null`. Guards the recursive child descent
 * so a `children` array containing non-objects is skipped rather than crashing
 * with `Cannot read 'type' of …`.
 */
export function asSerializedNode(value: unknown): SerializedNode | null {
  return typeof value === 'object' && value !== null && typeof (value as Data).type === 'string' ? (value as SerializedNode) : null;
}

/**
 * Narrow an already-extracted value to an array of finite numbers (non-numeric
 * or non-finite entries collapse to `0`), or `null` when not an array.
 */
export function asNumberArray(value: unknown): number[] | null {
  return Array.isArray(value) ? value.map(entry => (typeof entry === 'number' && Number.isFinite(entry) ? entry : 0)) : null;
}

// ── Serialized-enum value lists ──────────────────────────────────────────────
// `satisfies readonly T[]` makes a typo here a compile error (a listed value
// that is not a union member fails to type-check). If a new union member is
// added upstream, an omission here only makes an otherwise-valid value fall
// back to its default — never unsafe — so keep these in sync deliberately.

/** Allowed {@link FontWeight} values for {@link readEnum}. */
export const FONT_WEIGHTS = ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'] as const satisfies readonly FontWeight[];

/** Allowed {@link TextAlignment} values for {@link readEnum}. */
export const TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const satisfies readonly TextAlignment[];

/** Allowed {@link RepeatMode} values for {@link readEnum}. */
export const REPEAT_MODES = ['stretch', 'repeat', 'mirror-repeat'] as const satisfies readonly RepeatMode[];

/** Allowed {@link RepeatFit} values for {@link readEnum}. */
export const REPEAT_FITS = ['clip', 'round'] as const satisfies readonly RepeatFit[];
