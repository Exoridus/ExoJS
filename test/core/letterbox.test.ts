import { computeLetterboxLayout } from '#core/letterbox';

describe('computeLetterboxLayout', () => {
  test('matching aspect fills the parent with no bars', () => {
    const layout = computeLetterboxLayout(1920, 1080, 1280, 720, 1);

    expect(layout.contentWidthCss).toBeCloseTo(1920, 5);
    expect(layout.contentHeightCss).toBeCloseTo(1080, 5);
    expect(layout.backingWidth).toBe(1920);
    expect(layout.backingHeight).toBe(1080);
  });

  test('square parent letterboxes a 16:9 design (vertical bars)', () => {
    const layout = computeLetterboxLayout(800, 800, 1280, 720, 1);

    // width-constrained: 800 wide, 800 × (720/1280) = 450 tall, centered → bars top/bottom.
    expect(layout.contentWidthCss).toBeCloseTo(800, 5);
    expect(layout.contentHeightCss).toBeCloseTo(450, 5);
    expect(layout.backingWidth).toBe(800);
    expect(layout.backingHeight).toBe(450);
  });

  test('tall parent pillarboxes a 16:9 design (horizontal bars)', () => {
    const layout = computeLetterboxLayout(720, 1280, 1280, 720, 1);

    // height-constrained: scale = min(720/1280, 1280/720) = 0.5625 → 720 × 405.
    expect(layout.contentWidthCss).toBeCloseTo(720, 5);
    expect(layout.contentHeightCss).toBeCloseTo(405, 5);
  });

  test('aspect ratio is always preserved (never stretched)', () => {
    for (const [pw, ph] of [
      [1000, 500],
      [333, 999],
      [1600, 900],
      [2560, 1440],
    ]) {
      const layout = computeLetterboxLayout(pw, ph, 1280, 720, 1);

      expect(layout.contentWidthCss / layout.contentHeightCss).toBeCloseTo(1280 / 720, 5);
    }
  });

  test('content never exceeds the parent on either axis', () => {
    const layout = computeLetterboxLayout(1000, 500, 1280, 720, 1);

    expect(layout.contentWidthCss).toBeLessThanOrEqual(1000 + 1e-6);
    expect(layout.contentHeightCss).toBeLessThanOrEqual(500 + 1e-6);
  });

  test('pixelRatio scales only the backing store, not the CSS content size', () => {
    const layout = computeLetterboxLayout(1920, 1080, 1280, 720, 2);

    expect(layout.contentWidthCss).toBeCloseTo(1920, 5);
    expect(layout.contentHeightCss).toBeCloseTo(1080, 5);
    expect(layout.backingWidth).toBe(3840);
    expect(layout.backingHeight).toBe(2160);
  });

  test('degenerate zero parent size clamps the backing store to >= 1', () => {
    const layout = computeLetterboxLayout(0, 0, 1280, 720, 1);

    expect(layout.backingWidth).toBeGreaterThanOrEqual(1);
    expect(layout.backingHeight).toBeGreaterThanOrEqual(1);
  });
});
