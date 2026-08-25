import { type CollisionFilter, defaultFilter } from '@codexo/exojs-physics';

import type { ColliderDefaults, TileColliderContext } from './types';

const DEFAULT_FRICTION = 0.6;
const DEFAULT_RESTITUTION = 0;
const DEFAULT_DENSITY = 1;

/** A fully resolved collider material: every field decided, nothing optional. */
export interface ResolvedMaterial {
  readonly friction: number;
  readonly restitution: number;
  readonly density: number;
  readonly isSensor: boolean;
  readonly filter: CollisionFilter;
}

/** Resolve the call-level defaults once, before any geometry is walked. */
export const resolveDefaults = (options: ColliderDefaults): ResolvedMaterial => ({
  friction: options.friction ?? DEFAULT_FRICTION,
  restitution: options.restitution ?? DEFAULT_RESTITUTION,
  density: options.density ?? DEFAULT_DENSITY,
  isSensor: options.isSensor ?? false,
  filter: {
    category: options.filter?.category ?? defaultFilter.category,
    mask: options.filter?.mask ?? defaultFilter.mask,
    group: options.filter?.group ?? defaultFilter.group,
  },
});

/** Apply a resolver's overrides over already-resolved defaults. */
export const resolveMaterial = (defaults: ResolvedMaterial, resolver: ColliderDefaults['material'], context: TileColliderContext): ResolvedMaterial => {
  const override = resolver?.(context);

  if (override === undefined || override === null) {
    return defaults;
  }

  return {
    friction: override.friction ?? defaults.friction,
    restitution: override.restitution ?? defaults.restitution,
    density: override.density ?? defaults.density,
    isSensor: override.isSensor ?? defaults.isSensor,
    filter: {
      category: override.filter?.category ?? defaults.filter.category,
      mask: override.filter?.mask ?? defaults.filter.mask,
      group: override.filter?.group ?? defaults.filter.group,
    },
  };
};

/**
 * Identity of everything a chain collider can carry, used to decide which solid
 * cells may be traced into a common outline.
 *
 * `density` is deliberately absent: a chain has no mass properties and the
 * bodies are static, so two regions differing only in density are
 * indistinguishable once built, and keying on it would split outlines for no
 * observable difference.
 */
export const materialKey = (material: ResolvedMaterial): string =>
  `${material.friction}|${material.restitution}|${material.isSensor ? 1 : 0}|${material.filter.category}|${material.filter.mask}|${material.filter.group}`;
