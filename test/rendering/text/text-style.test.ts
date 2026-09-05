/**
 * Tests for TextStyle: option normalization/defaults, dirty tracking +
 * StyleChangeHint merging ('tint' < 'layout' < 'font'), the derived `font`
 * CSS string, and copy()/clone().
 */

import { Color } from '#core/Color';
import { textGradientMaxStops,TextStyle } from '#rendering/text/TextStyle';

// ---------------------------------------------------------------------------
// Constructor defaults
// ---------------------------------------------------------------------------

describe('TextStyle constructor defaults', () => {
  test('applies documented defaults when no options are given', () => {
    const style = new TextStyle();

    expect(style.fontFamily).toBe('Arial');
    expect(style.fontWeight).toBe('normal');
    expect(style.fontStyle).toBe('normal');
    expect(style.fontSize).toBe(20);
    expect(style.fillColor.equals(Color.white)).toBe(true);
    expect(style.outlineColor.equals(Color.black)).toBe(true);
    expect(style.outlineWidth).toBe(0);
    expect(style.align).toBe('left');
    expect(style.textTransform).toBe('none');
    expect(style.lineHeight).toBe(1.2);
    expect(style.leading).toBe(0);
    expect(style.shadowColor.equals(Color.black)).toBe(true);
    expect(style.shadowOffsetX).toBe(0);
    expect(style.shadowOffsetY).toBe(0);
    expect(style.shadowAlpha).toBe(0);
    expect(style.shadowBlur).toBe(0);
    expect(style.gradient).toBeNull();
  });

  test('overrides every default when options are provided', () => {
    const style = new TextStyle({
      fontFamily: 'Georgia',
      fontWeight: 'bold',
      fontStyle: 'italic',
      fontSize: 32,
      fillColor: Color.black,
      outlineColor: Color.white,
      outlineWidth: 0.2,
      align: 'center',
      textTransform: 'uppercase',
      lineHeight: 1.5,
      leading: 4,
      shadowColor: Color.white,
      shadowOffsetX: 2,
      shadowOffsetY: 3,
      shadowAlpha: 0.5,
      shadowBlur: 0.4,
      gradient: {
        stops: [
          { offset: 0, color: Color.white },
          { offset: 1, color: Color.black },
        ],
        angle: 90,
      },
    });

    expect(style.fontFamily).toBe('Georgia');
    expect(style.fontWeight).toBe('bold');
    expect(style.fontStyle).toBe('italic');
    expect(style.fontSize).toBe(32);
    expect(style.fillColor.equals(Color.black)).toBe(true);
    expect(style.outlineColor.equals(Color.white)).toBe(true);
    expect(style.outlineWidth).toBe(0.2);
    expect(style.align).toBe('center');
    expect(style.textTransform).toBe('uppercase');
    expect(style.lineHeight).toBe(1.5);
    expect(style.leading).toBe(4);
    expect(style.shadowColor.equals(Color.white)).toBe(true);
    expect(style.shadowOffsetX).toBe(2);
    expect(style.shadowOffsetY).toBe(3);
    expect(style.shadowAlpha).toBe(0.5);
    expect(style.shadowBlur).toBe(0.4);
    expect(style.gradient?.stops).toHaveLength(2);
    expect(style.gradient?.angle).toBe(90);
  });

  test('clones color options so mutating the caller-owned instance does not affect the style', () => {
    const fill = Color.white.clone();
    const style = new TextStyle({ fillColor: fill });

    // Colors are immutable-by-convention (no in-place mutators here), so we
    // just assert the style holds a distinct instance, not the same reference.
    expect(style.fillColor).not.toBe(fill);
    expect(style.fillColor.equals(fill)).toBe(true);
  });

  test('is dirty immediately after construction with hint "font"', () => {
    const style = new TextStyle();
    expect(style.consumeDirty()).toBe('font');
    expect(style.consumeDirty()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// consumeDirty() / dirty-flag lifecycle
// ---------------------------------------------------------------------------

describe('consumeDirty', () => {
  test('returns null when nothing has changed since the last call', () => {
    const style = new TextStyle();
    style.consumeDirty(); // clear initial 'font' dirty from construction

    expect(style.consumeDirty()).toBeNull();
  });

  test('fires onChange exactly once per dirty cycle, even for multiple mutations', () => {
    const style = new TextStyle();
    style.consumeDirty();

    const handler = vi.fn();
    style.onChange.add(handler);

    style.fontSize = 99; // 'layout'
    style.align = 'right'; // 'layout'
    style.fillColor = Color.black; // 'tint' — does not escalate past 'layout'

    expect(handler).toHaveBeenCalledTimes(1);
    expect(style.consumeDirty()).toBe('layout');
  });
});

// ---------------------------------------------------------------------------
// StyleChangeHint merging: 'tint' < 'layout' < 'font'
// ---------------------------------------------------------------------------

describe('StyleChangeHint merging', () => {
  const freshStyle = (): TextStyle => {
    const style = new TextStyle();
    style.consumeDirty();
    return style;
  };

  test('a lone tint change reports hint "tint"', () => {
    const style = freshStyle();
    style.fillColor = Color.black;
    expect(style.consumeDirty()).toBe('tint');
  });

  test('a lone layout change reports hint "layout"', () => {
    const style = freshStyle();
    style.fontSize = 30;
    expect(style.consumeDirty()).toBe('layout');
  });

  test('a lone font change reports hint "font"', () => {
    const style = freshStyle();
    style.fontFamily = 'Georgia';
    expect(style.consumeDirty()).toBe('font');
  });

  test('tint followed by layout escalates to "layout"', () => {
    const style = freshStyle();
    style.fillColor = Color.black;
    style.fontSize = 30;
    expect(style.consumeDirty()).toBe('layout');
  });

  test('layout followed by font escalates to "font"', () => {
    const style = freshStyle();
    style.fontSize = 30;
    style.fontFamily = 'Georgia';
    expect(style.consumeDirty()).toBe('font');
  });

  test('font followed by tint stays "font" (order-independent max)', () => {
    const style = freshStyle();
    style.fontFamily = 'Georgia';
    style.fillColor = Color.black;
    expect(style.consumeDirty()).toBe('font');
  });

  test('font followed by layout stays "font"', () => {
    const style = freshStyle();
    style.fontFamily = 'Georgia';
    style.fontSize = 30;
    expect(style.consumeDirty()).toBe('font');
  });

  test('hint resets to "tint" baseline after consumeDirty', () => {
    const style = freshStyle();
    style.fontFamily = 'Georgia';
    expect(style.consumeDirty()).toBe('font');

    // Next cycle: a lone tint change should report 'tint', not the stale 'font'.
    style.fillColor = Color.black;
    expect(style.consumeDirty()).toBe('tint');
  });
});

// ---------------------------------------------------------------------------
// Individual setters - no-op vs. change branches
// ---------------------------------------------------------------------------

describe('setters', () => {
  const freshStyle = (): TextStyle => {
    const style = new TextStyle();
    style.consumeDirty();
    return style;
  };

  test('fontFamily: same value is a no-op', () => {
    const style = freshStyle();
    style.fontFamily = 'Arial';
    expect(style.consumeDirty()).toBeNull();
  });

  test('fontFamily: accepts a FontFace instance and extracts its family', () => {
    class MockFontFace {
      family: string;
      constructor(family: string) {
        this.family = family;
      }
    }
    const origFontFace = (globalThis as Record<string, unknown>).FontFace;
    (globalThis as Record<string, unknown>).FontFace = MockFontFace;

    try {
      const style = freshStyle();
      const face = new MockFontFace('Roboto') as unknown as FontFace;
      style.fontFamily = face;

      expect(style.fontFamily).toBe('Roboto');
      expect(style.consumeDirty()).toBe('font');
    } finally {
      (globalThis as Record<string, unknown>).FontFace = origFontFace;
    }
  });

  test('fontWeight: same value is a no-op; different value marks font-dirty', () => {
    const style = freshStyle();
    style.fontWeight = 'normal';
    expect(style.consumeDirty()).toBeNull();

    style.fontWeight = 'bold';
    expect(style.fontWeight).toBe('bold');
    expect(style.consumeDirty()).toBe('font');
  });

  test('fontStyle: same value is a no-op; different value marks font-dirty', () => {
    const style = freshStyle();
    style.fontStyle = 'normal';
    expect(style.consumeDirty()).toBeNull();

    style.fontStyle = 'italic';
    expect(style.fontStyle).toBe('italic');
    expect(style.consumeDirty()).toBe('font');
  });

  test('fontSize: same value is a no-op; different value marks layout-dirty', () => {
    const style = freshStyle();
    style.fontSize = 20; // default fontSize — same value
    expect(style.consumeDirty()).toBeNull();

    style.fontSize = 40;
    expect(style.consumeDirty()).toBe('layout');
  });

  test('align: same value is a no-op; different value marks layout-dirty', () => {
    const style = freshStyle();
    style.align = 'left';
    expect(style.consumeDirty()).toBeNull();

    style.align = 'justify';
    expect(style.consumeDirty()).toBe('layout');
  });

  test('fontVariant: same value is a no-op; different value marks font-dirty', () => {
    const style = freshStyle();
    style.fontVariant = 'normal';
    expect(style.consumeDirty()).toBeNull();

    style.fontVariant = 'small-caps';
    expect(style.consumeDirty()).toBe('font');
  });

  test('textTransform: same value is a no-op; different value marks layout-dirty', () => {
    const style = freshStyle();
    style.textTransform = 'none';
    expect(style.consumeDirty()).toBeNull();

    style.textTransform = 'capitalize';
    expect(style.consumeDirty()).toBe('layout');
  });

  test('lineHeight: same value is a no-op; different value marks layout-dirty', () => {
    const style = freshStyle();
    style.lineHeight = 1.2; // default lineHeight — same value
    expect(style.consumeDirty()).toBeNull();

    style.lineHeight = 2;
    expect(style.consumeDirty()).toBe('layout');
  });

  test('leading: same value is a no-op; different value marks layout-dirty', () => {
    const style = freshStyle();
    style.leading = 0;
    expect(style.consumeDirty()).toBeNull();

    style.leading = 6;
    expect(style.consumeDirty()).toBe('layout');
  });

  test('fillColor: always clones and marks tint-dirty (no equality short-circuit)', () => {
    const style = freshStyle();
    const c = Color.white.clone();
    style.fillColor = c;

    expect(style.fillColor).not.toBe(c);
    expect(style.consumeDirty()).toBe('tint');
  });

  test('outlineColor: always clones and marks tint-dirty', () => {
    const style = freshStyle();
    const c = Color.black.clone();
    style.outlineColor = c;

    expect(style.outlineColor).not.toBe(c);
    expect(style.consumeDirty()).toBe('tint');
  });

  test('outlineWidth: same value is a no-op; different value marks tint-dirty', () => {
    const style = freshStyle();
    style.outlineWidth = 0;
    expect(style.consumeDirty()).toBeNull();

    style.outlineWidth = 0.3;
    expect(style.consumeDirty()).toBe('tint');
  });

  test('shadowColor: always clones and marks tint-dirty', () => {
    const style = freshStyle();
    const c = Color.white.clone();
    style.shadowColor = c;

    expect(style.shadowColor).not.toBe(c);
    expect(style.consumeDirty()).toBe('tint');
  });

  test('shadowOffsetX/Y, shadowAlpha, shadowBlur: same value no-op, different value marks tint-dirty', () => {
    const style = freshStyle();

    style.shadowOffsetX = 0;
    style.shadowOffsetY = 0;
    style.shadowAlpha = 0;
    style.shadowBlur = 0;
    expect(style.consumeDirty()).toBeNull();

    style.shadowOffsetX = 5;
    expect(style.consumeDirty()).toBe('tint');

    style.shadowOffsetY = 5;
    expect(style.consumeDirty()).toBe('tint');

    style.shadowAlpha = 0.8;
    expect(style.consumeDirty()).toBe('tint');

    style.shadowBlur = 0.6;
    expect(style.consumeDirty()).toBe('tint');
  });

  test('gradient: setting and clearing both clone and mark tint-dirty', () => {
    const style = freshStyle();
    const first = Color.white;

    style.gradient = {
      stops: [
        { offset: 0, color: first },
        { offset: 1, color: Color.black },
      ],
    };
    expect(style.gradient?.stops[0].color).not.toBe(first);
    expect(style.consumeDirty()).toBe('tint');

    style.gradient = null;
    expect(style.gradient).toBeNull();
    expect(style.consumeDirty()).toBe('tint');
  });

  test('gradient: stops are clamped and ordered on the way in', () => {
    const style = freshStyle();

    style.gradient = {
      stops: [
        { offset: 2, color: Color.black },
        { offset: -1, color: Color.white },
        { offset: 0.5, color: Color.red },
      ],
    };

    expect(style.gradient?.stops.map(stop => stop.offset)).toEqual([0, 0.5, 1]);
  });

  test('gradient: the angle defaults to a top-to-bottom ramp', () => {
    const style = freshStyle();

    style.gradient = {
      stops: [
        { offset: 0, color: Color.white },
        { offset: 1, color: Color.black },
      ],
    };

    expect(style.gradient?.angle).toBe(180);
  });

  test('gradient: rejects a single stop', () => {
    const style = freshStyle();

    expect(() => {
      style.gradient = { stops: [{ offset: 0, color: Color.white }] };
    }).toThrow(/2 colour stops/);
  });

  test('gradient: rejects more stops than the packed row can carry', () => {
    const style = freshStyle();
    const stops = Array.from({ length: textGradientMaxStops + 1 }, (_, i) => ({ offset: i / textGradientMaxStops, color: Color.white }));

    expect(() => {
      style.gradient = { stops };
    }).toThrow(/at most/);
  });
});

// ---------------------------------------------------------------------------
// Derived `font` CSS string
// ---------------------------------------------------------------------------

describe('font (derived CSS string)', () => {
  test('normal weight/style omits the italic prefix', () => {
    const style = new TextStyle({ fontFamily: 'Arial', fontSize: 16 });
    expect(style.font).toBe('normal 16px Arial');
  });

  test('bold weight is included without an italic prefix', () => {
    const style = new TextStyle({ fontFamily: 'Arial', fontSize: 16, fontWeight: 'bold' });
    expect(style.font).toBe('bold 16px Arial');
  });

  test('italic style prepends "italic " before the weight', () => {
    const style = new TextStyle({ fontFamily: 'Georgia', fontSize: 24, fontStyle: 'italic', fontWeight: 'bold' });
    expect(style.font).toBe('italic bold 24px Georgia');
  });

  test('oblique style prepends "oblique " before the weight', () => {
    const style = new TextStyle({ fontFamily: 'Georgia', fontSize: 24, fontStyle: 'oblique' });
    expect(style.font).toBe('oblique normal 24px Georgia');
  });

  test('small caps sit between the style and the weight, as the CSS shorthand requires', () => {
    const style = new TextStyle({ fontFamily: 'Georgia', fontSize: 24, fontStyle: 'italic', fontVariant: 'small-caps', fontWeight: 'bold' });
    expect(style.font).toBe('italic small-caps bold 24px Georgia');
  });
});

// ---------------------------------------------------------------------------
// copy() / clone()
// ---------------------------------------------------------------------------

describe('copy', () => {
  test('copies all properties from another instance and marks font-dirty', () => {
    const source = new TextStyle({
      fontFamily: 'Georgia',
      fontSize: 40,
      align: 'right',
      textTransform: 'capitalize',
      lineHeight: 1.8,
      leading: 2,
      fillColor: Color.black,
      gradient: {
        stops: [
          { offset: 0, color: Color.white },
          { offset: 1, color: Color.black },
        ],
      },
    });
    const target = new TextStyle();
    target.consumeDirty();

    target.copy(source);

    expect(target.fontFamily).toBe('Georgia');
    expect(target.fontSize).toBe(40);
    expect(target.align).toBe('right');
    expect(target.textTransform).toBe('capitalize');
    expect(target.lineHeight).toBe(1.8);
    expect(target.leading).toBe(2);
    expect(target.fillColor.equals(Color.black)).toBe(true);
    expect(target.gradient).not.toBeNull();
    // Colors must be independently cloned, not shared references.
    expect(target.fillColor).not.toBe(source.fillColor);
    expect(target.consumeDirty()).toBe('font');
  });

  test('copying a style into itself is a no-op (guarded by the `style !== this` check)', () => {
    const style = new TextStyle({ fontFamily: 'Georgia', fontSize: 40 });
    style.consumeDirty();

    style.copy(style);

    expect(style.fontFamily).toBe('Georgia');
    expect(style.fontSize).toBe(40);
    expect(style.consumeDirty()).toBeNull(); // no self-inflicted dirty flag
  });

  test('copy with a null gradient on the source clears the target gradient', () => {
    const source = new TextStyle({ gradient: null });
    const target = new TextStyle({
      gradient: {
        stops: [
          { offset: 0, color: Color.white },
          { offset: 1, color: Color.black },
        ],
      },
    });
    target.consumeDirty();

    target.copy(source);

    expect(target.gradient).toBeNull();
  });
});

describe('clone', () => {
  test('produces an equivalent but independent instance', () => {
    const source = new TextStyle({
      fontFamily: 'Georgia',
      fontSize: 40,
      align: 'right',
      textTransform: 'capitalize',
      fillColor: Color.black,
      gradient: {
        stops: [
          { offset: 0, color: Color.white },
          { offset: 1, color: Color.black },
        ],
      },
    });

    const cloned = source.clone();

    expect(cloned).not.toBe(source);
    expect(cloned.fontFamily).toBe('Georgia');
    expect(cloned.fontSize).toBe(40);
    expect(cloned.align).toBe('right');
    expect(cloned.textTransform).toBe('capitalize');
    expect(cloned.fillColor.equals(Color.black)).toBe(true);
    expect(cloned.fillColor).not.toBe(source.fillColor);
    expect(cloned.gradient).not.toBeNull();
    expect(cloned.gradient?.stops[0].color).not.toBe(source.gradient?.stops[0].color);
  });

  test('mutating the clone does not affect the source', () => {
    const source = new TextStyle({ fontSize: 20 });
    const cloned = source.clone();

    cloned.fontSize = 99;

    expect(source.fontSize).toBe(20);
    expect(cloned.fontSize).toBe(99);
  });

  test('clone with a null gradient stays null', () => {
    const source = new TextStyle();
    const cloned = source.clone();

    expect(cloned.gradient).toBeNull();
  });

  test('is dirty with hint "font" immediately after cloning', () => {
    const source = new TextStyle();
    source.consumeDirty();

    const cloned = source.clone();

    expect(cloned.consumeDirty()).toBe('font');
  });
});
