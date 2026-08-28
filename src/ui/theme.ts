import { Color } from '#core/Color';
import type { NineSliceInsets, NineSliceModes } from '#rendering/sprite/nineSlice';
import type { TextStyleOptions } from '#rendering/text/TextStyle';
import type { Texture } from '#rendering/texture/Texture';
import type { TextureRegion } from '#rendering/texture/TextureRegion';

/**
 * Per-edge pixel insets. A skin's insets are layout input, not decoration: they
 * describe the content box a widget positions its content in, so changing them
 * re-lays out the widget rather than only repainting it.
 */
export interface UIInsets {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * Visual state a widget paints in. A widget that tracks no interaction stays on
 * `'normal'`; states a skin set leaves undefined fall back to `'normal'`.
 */
export type UIWidgetState = 'normal' | 'hover' | 'pressed' | 'disabled' | 'focused';

/** Widget surface that paints nothing - the whole node is its content. */
export interface UINoBackground {
  readonly kind: 'none';
}

/** Vector background: a rounded rectangle with an optional stroked border. */
export interface UIFillBackground {
  readonly kind: 'fill';
  readonly color: Color;
  readonly borderColor: Color;
  /** Border thickness in pixels; `0` draws no border. */
  readonly borderWidth: number;
  /** Corner radius in pixels, clamped to half the widget's smaller side. */
  readonly cornerRadius: number;
}

/**
 * Textured background drawn as a nine-slice, so corners stay pixel-perfect
 * while edges and center fill the widget's layout size.
 */
export interface UINineSliceBackground {
  readonly kind: 'nineSlice';
  readonly texture: Texture | TextureRegion;
  /** Source-texture slice widths, in texels. */
  readonly slices: number | Partial<NineSliceInsets>;
  /** Destination border widths; defaults to `slices` (1:1 corners). */
  readonly border?: number | Partial<NineSliceInsets>;
  readonly modes?: NineSliceModes;
}

/** How a sprite background fills the widget box. */
export type UISpriteFit = 'stretch' | 'tile';

/**
 * Flat textured background: one image stretched over the widget box or tiled
 * across it. Use a nine-slice instead for art with a frame that must keep its
 * corner proportions.
 */
export interface UISpriteBackground {
  readonly kind: 'sprite';
  readonly texture: Texture | TextureRegion;
  readonly fit: UISpriteFit;
}

/** How a widget paints its body. */
export type UIBackground = UINoBackground | UIFillBackground | UINineSliceBackground | UISpriteBackground;

/**
 * What a background can be stated as. A texture or region becomes a textured
 * descriptor, a colour becomes a fill; a descriptor is taken as it is.
 */
export type UIBackgroundInput = Color | Texture | TextureRegion | UIBackground;

/** How a texture is turned into a background descriptor. */
export interface UIBackgroundOptions {
  /** Source-texture slice widths in texels; defaults to a third of the source per axis. */
  readonly slices?: number | Partial<NineSliceInsets>;
  /** Destination border widths; defaults to `slices`. */
  readonly border?: number | Partial<NineSliceInsets>;
  readonly modes?: NineSliceModes;
  /** Paint the texture flat with this fit instead of slicing it. */
  readonly fit?: UISpriteFit;
}

/**
 * The look of one widget surface in one state: what it paints, how its text is
 * styled, and the content box its layout works against.
 */
export interface UISkin {
  readonly background: UIBackground;
  readonly text: TextStyleOptions;
  readonly insets: UIInsets;
}

/**
 * One skin per state. Only `normal` is required - {@link resolveUISkin} falls
 * back to it for every state a set does not define.
 */
export type UISkinSet = { readonly normal: UISkin } & Partial<Readonly<Record<Exclude<UIWidgetState, 'normal'>, UISkin>>>;

/**
 * A themed surface. Roles are per painted surface, not per widget class: a
 * progress bar draws its track and its fill from two independent roles.
 */
export type UIThemeRole = 'panel' | 'button' | 'label' | 'progressBarTrack' | 'progressBarFill' | 'scrollbarTrack' | 'scrollbarThumb';

/** Skins for every role, as resolved for a widget. */
export type UITheme = Readonly<Record<UIThemeRole, UISkinSet>>;

/** Skin fields to override; an omitted field keeps the inherited one. */
export type UISkinPatch = Partial<UISkin>;

/** Per-state skin overrides. */
export type UISkinSetPatch = Partial<Readonly<Record<UIWidgetState, UISkinPatch>>>;

/**
 * Theme overrides applied on top of an inherited theme. Fields are replaced
 * whole: naming `background` replaces the entire descriptor, since blending
 * half a fill into a nine-slice has no meaning. Single-property tweaks belong
 * on the widget (`panel.setFill({ color })`), not in a theme patch.
 */
export type UIThemePatch = Partial<Readonly<Record<UIThemeRole, UISkinSetPatch>>>;

/** Fill properties to override on a widget's background; omitted ones keep the skin's value. */
export interface UIFillPatch {
  readonly color?: Color;
  readonly borderColor?: Color;
  readonly borderWidth?: number;
  readonly cornerRadius?: number;
}

/**
 * The background options a widget's options object states, for the texture
 * path. Absent keys are dropped so a widget never states a slice, border or
 * fit it was not given.
 *
 * @internal
 */
export const backgroundOptionsFrom = (options: { [Key in keyof UIBackgroundOptions]?: UIBackgroundOptions[Key] | undefined }): UIBackgroundOptions => ({
  ...(options.slices !== undefined && { slices: options.slices }),
  ...(options.border !== undefined && { border: options.border }),
  ...(options.modes !== undefined && { modes: options.modes }),
  ...(options.fit !== undefined && { fit: options.fit }),
});

/** A third of `size`, floored - the slice width a texture gets when none is stated. */
const thirdOf = (size: number): number => Math.max(0, Math.floor(size / 3));

/**
 * Normalise a texture, region or descriptor into a background descriptor.
 *
 * A texture becomes a nine-slice whose slices default to a third of the source
 * per axis, so a frame is usable without measuring it first; a real skin states
 * its slices. A source edge under three pixels degenerates to a slice of zero,
 * which stretches that axis rather than failing. Passing `fit` paints the
 * texture flat instead, and a descriptor is returned unchanged.
 */
export const createUIBackground = (source: Texture | TextureRegion | UIBackground, options: UIBackgroundOptions = {}): UIBackground => {
  if ('kind' in source) {
    return source;
  }

  if (options.fit !== undefined) {
    return { kind: 'sprite', texture: source, fit: options.fit };
  }

  return {
    kind: 'nineSlice',
    texture: source,
    slices: options.slices ?? { left: thirdOf(source.width), top: thirdOf(source.height), right: thirdOf(source.width), bottom: thirdOf(source.height) },
    ...(options.border !== undefined && { border: options.border }),
    ...(options.modes !== undefined && { modes: options.modes }),
  };
};

const zeroInsets: UIInsets = { left: 0, top: 0, right: 0, bottom: 0 };

const noBackground: UINoBackground = { kind: 'none' };

const fill = (color: Color, cornerRadius: number, borderColor: Color = new Color(255, 255, 255, 0), borderWidth = 0): UIFillBackground => ({
  kind: 'fill',
  color,
  borderColor,
  borderWidth,
  cornerRadius,
});

const skin = (background: UIBackground, text: TextStyleOptions = {}, insets: UIInsets = zeroInsets): UISkin => ({ background, text, insets });

const buttonText: TextStyleOptions = { fillColor: new Color(255, 255, 255, 1), fontSize: 16, align: 'center' };

/**
 * The theme a UI layer uses until one is assigned. It reproduces the widgets'
 * built-in look, so assigning a patch changes only what the patch names.
 */
export const defaultUITheme: UITheme = {
  panel: {
    normal: skin(fill(new Color(30, 34, 45, 0.92), 8, new Color(255, 255, 255, 0.12), 0)),
  },
  button: {
    normal: skin(fill(new Color(54, 120, 220, 1), 8), buttonText),
    hover: skin(fill(new Color(74, 140, 240, 1), 8), buttonText),
    pressed: skin(fill(new Color(40, 96, 180, 1), 8), buttonText),
    disabled: skin(fill(new Color(70, 76, 90, 1), 8), buttonText),
  },
  label: {
    normal: skin(noBackground, { fillColor: new Color(255, 255, 255, 1), fontSize: 16 }),
  },
  progressBarTrack: {
    normal: skin(fill(new Color(255, 255, 255, 0.16), 4)),
  },
  progressBarFill: {
    normal: skin(fill(new Color(80, 220, 120, 1), 4)),
  },
  scrollbarTrack: {
    normal: skin(fill(new Color(255, 255, 255, 0.08), 6)),
  },
  scrollbarThumb: {
    normal: skin(fill(new Color(255, 255, 255, 0.28), 6)),
    hover: skin(fill(new Color(255, 255, 255, 0.42), 6)),
    pressed: skin(fill(new Color(255, 255, 255, 0.56), 6)),
  },
};

const neutralFill: UIFillBackground = fill(new Color(0, 0, 0, 0), 0, new Color(0, 0, 0, 0), 0);

/**
 * Apply a widget's fill overrides on top of the background its skin provides.
 * A patched skin that does not paint a fill (a nine-slice, or nothing) becomes
 * one: the caller asked for a colour, so they get a colour.
 *
 * @internal
 */
export const applyUIFillPatch = (background: UIBackground, patch: UIFillPatch | null): UIBackground => {
  if (patch === null) {
    return background;
  }

  const base = background.kind === 'fill' ? background : neutralFill;

  return {
    kind: 'fill',
    color: patch.color ?? base.color,
    borderColor: patch.borderColor ?? base.borderColor,
    borderWidth: patch.borderWidth ?? base.borderWidth,
    cornerRadius: patch.cornerRadius ?? base.cornerRadius,
  };
};

/** The skin a state paints with, falling back to `normal` where undefined. */
export const resolveUISkin = (set: UISkinSet, state: UIWidgetState): UISkin => set[state] ?? set.normal;

const mergeSkin = (base: UISkin, patch: UISkinPatch): UISkin => ({
  background: patch.background ?? base.background,
  text: patch.text ?? base.text,
  insets: patch.insets ?? base.insets,
});

const mergeSkinSet = (base: UISkinSet, patch: UISkinSetPatch): UISkinSet => {
  const merged: { normal: UISkin } & Partial<Record<Exclude<UIWidgetState, 'normal'>, UISkin>> = { ...base };

  for (const state of Object.keys(patch) as UIWidgetState[]) {
    const skinPatch = patch[state];

    if (skinPatch !== undefined) {
      merged[state] = mergeSkin(resolveUISkin(base, state), skinPatch);
    }
  }

  return merged;
};

/**
 * Resolve `patch` against `base`, role by role and state by state. Roles the
 * patch does not name keep the base object itself, so an unchanged theme stays
 * identical by reference - which is what makes a cascade refresh a pointer
 * comparison rather than a deep diff.
 */
export const createUITheme = (patch: UIThemePatch, base: UITheme = defaultUITheme): UITheme => {
  const roles = Object.keys(patch) as UIThemeRole[];

  if (roles.length === 0) {
    return base;
  }

  const merged = { ...base };

  for (const role of roles) {
    const setPatch = patch[role];

    if (setPatch !== undefined) {
      merged[role] = mergeSkinSet(base[role], setPatch);
    }
  }

  return merged;
};

// Dev builds freeze the default theme so a caller who mutates a shared skin -
// or a `Color` inside one - fails at the write instead of silently restyling
// every widget that inherited it. `Color` fills its `_rgba` / `_array` caches
// lazily, so each one is warmed before freezing; an unwarmed frozen colour
// would throw on a plain read.
if (__DEV__) {
  const freezeColor = (color: Color): void => {
    color.toRgba8();
    color.toArray();
    Object.freeze(color);
  };

  const freezeBackground = (background: UIBackground): void => {
    if (background.kind === 'fill') {
      freezeColor(background.color);
      freezeColor(background.borderColor);
    }

    Object.freeze(background);
  };

  for (const set of Object.values(defaultUITheme)) {
    for (const stateSkin of Object.values(set)) {
      freezeBackground(stateSkin.background);

      if (stateSkin.text.fillColor !== undefined) {
        freezeColor(stateSkin.text.fillColor);
      }

      Object.freeze(stateSkin.text);
      Object.freeze(stateSkin.insets);
      Object.freeze(stateSkin);
    }

    Object.freeze(set);
  }

  Object.freeze(defaultUITheme);
}
