import { isPixelSnapMode, PixelSnapMode } from '#rendering/pixelSnap';

it('PixelSnapMode is a numeric enum with shader-encoding values', () => {
  expect(PixelSnapMode.None).toBe(0);
  expect(PixelSnapMode.Position).toBe(1);
  expect(PixelSnapMode.Geometry).toBe(2);
});

it('isPixelSnapMode accepts exactly the enum values', () => {
  expect(isPixelSnapMode(PixelSnapMode.None)).toBe(true);
  expect(isPixelSnapMode(PixelSnapMode.Position)).toBe(true);
  expect(isPixelSnapMode(PixelSnapMode.Geometry)).toBe(true);
  expect(isPixelSnapMode('position')).toBe(false);
  expect(isPixelSnapMode(3)).toBe(false);
  expect(isPixelSnapMode(1.5)).toBe(false);
  expect(isPixelSnapMode(null)).toBe(false);
});
