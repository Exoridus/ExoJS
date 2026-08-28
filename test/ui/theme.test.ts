import { Color } from '#core/Color';
import type { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';
import type { UIFillBackground, UISkinSet } from '#ui/theme';
import { createUIBackground, createUITheme, defaultUITheme, resolveUISkin } from '#ui/theme';

const fillOf = (set: UISkinSet, state: 'normal' | 'hover' | 'pressed' | 'disabled' | 'focused' = 'normal'): UIFillBackground => {
  const background = resolveUISkin(set, state).background;

  if (background.kind !== 'fill') {
    throw new Error(`expected a fill background, got '${background.kind}'`);
  }

  return background;
};

describe('defaultUITheme', () => {
  test('carries the widgets built-in look', () => {
    expect(fillOf(defaultUITheme.panel).color.toRgba8()).toEqual(new Color(30, 34, 45, 0.92).toRgba8());
    expect(fillOf(defaultUITheme.button).color.toRgba8()).toEqual(new Color(54, 120, 220, 1).toRgba8());
    expect(fillOf(defaultUITheme.button, 'pressed').color.toRgba8()).toEqual(new Color(40, 96, 180, 1).toRgba8());
    expect(fillOf(defaultUITheme.progressBarFill).cornerRadius).toBe(4);
    expect(defaultUITheme.label.normal.background.kind).toBe('none');
  });

  test('is frozen in development builds, so a shared skin cannot be restyled by accident', () => {
    expect(() => fillOf(defaultUITheme.panel).color.set(1, 2, 3, 1)).toThrow();
    expect(Object.isFrozen(defaultUITheme.panel.normal)).toBe(true);
  });
});

describe('resolveUISkin', () => {
  test('falls back to the normal skin for states a set does not define', () => {
    expect(resolveUISkin(defaultUITheme.panel, 'hover')).toBe(defaultUITheme.panel.normal);
    expect(resolveUISkin(defaultUITheme.button, 'hover')).toBe(defaultUITheme.button.hover);
  });
});

describe('createUITheme', () => {
  test('returns the base itself for an empty patch', () => {
    expect(createUITheme({})).toBe(defaultUITheme);
  });

  test('keeps unpatched roles identical by reference', () => {
    const theme = createUITheme({ panel: { normal: { insets: { left: 4, top: 4, right: 4, bottom: 4 } } } });

    expect(theme.button).toBe(defaultUITheme.button);
    expect(theme.panel).not.toBe(defaultUITheme.panel);
  });

  test('replaces named skin fields and keeps the rest', () => {
    const background: UIFillBackground = { kind: 'fill', color: new Color(1, 2, 3, 1), borderColor: new Color(0, 0, 0, 1), borderWidth: 2, cornerRadius: 0 };
    const theme = createUITheme({ panel: { normal: { background } } });

    expect(theme.panel.normal.background).toBe(background);
    expect(theme.panel.normal.insets).toBe(defaultUITheme.panel.normal.insets);
  });

  test('derives a patched state from the normal skin when the base does not define it', () => {
    const insets = { left: 6, top: 6, right: 6, bottom: 6 };
    const theme = createUITheme({ panel: { hover: { insets } } });

    expect(theme.panel.hover?.insets).toBe(insets);
    expect(theme.panel.hover?.background).toBe(defaultUITheme.panel.normal.background);
    expect(theme.panel.normal).toBe(defaultUITheme.panel.normal);
  });

  test('resolves against an explicit base theme rather than the default', () => {
    const dark = createUITheme({ label: { normal: { text: { fontSize: 24 } } } });
    const larger = createUITheme({ button: { normal: { text: { fontSize: 32 } } } }, dark);

    expect(larger.label.normal.text.fontSize).toBe(24);
    expect(larger.button.normal.text.fontSize).toBe(32);
  });
});

describe('createUIBackground', () => {
  const texture = (width: number, height: number): Texture => ({ width, height }) as unknown as Texture;

  test('slices a texture into thirds per axis when no slices are given', () => {
    const background = createUIBackground(texture(128, 64));

    expect(background).toEqual({ kind: 'nineSlice', texture: expect.anything(), slices: { left: 42, top: 21, right: 42, bottom: 21 } });
  });

  test('degenerates to a plain stretch for a texture side under three pixels', () => {
    const background = createUIBackground(texture(2, 90));

    expect(background.kind === 'nineSlice' && background.slices).toEqual({ left: 0, top: 30, right: 0, bottom: 30 });
  });

  test('keeps explicit slices, border and modes', () => {
    const modes = { center: 'repeat' } as const;
    const background = createUIBackground(texture(128, 64), { slices: 8, border: 16, modes });

    expect(background).toEqual({ kind: 'nineSlice', texture: expect.anything(), slices: 8, border: 16, modes });
  });

  test('measures a region by its own size, not the texture it samples', () => {
    const region = new TextureRegion(texture(128, 64), { x: 0, y: 0, width: 30, height: 12 });
    const background = createUIBackground(region);

    expect(background.kind === 'nineSlice' && background.slices).toEqual({ left: 10, top: 4, right: 10, bottom: 4 });
  });

  test('produces a sprite background when a fit is requested', () => {
    const source = texture(128, 64);

    expect(createUIBackground(source, { fit: 'tile' })).toEqual({ kind: 'sprite', texture: source, fit: 'tile' });
  });

  test('passes a descriptor through unchanged', () => {
    const background = defaultUITheme.panel.normal.background;

    expect(createUIBackground(background)).toBe(background);
  });
});
