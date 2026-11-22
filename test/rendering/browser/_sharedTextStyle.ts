import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { BitmapText } from '#rendering/text/BitmapText';
import { BmFont } from '#rendering/text/BmFont';
import { Text } from '#rendering/text/Text';
import { TextStyle } from '#rendering/text/TextStyle';
import { Texture } from '#rendering/texture/Texture';

export const sharedTextCanvasSize = 320;
const rowHeight = 80;
const fontSize = 18;

interface InkBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Each reader has its own band; real glyph coverage must exist in every one. */
const inspectFrame = (pixels: ArrayLike<number>, red: boolean): InkBounds[] => {
  const bounds: InkBounds[] = [];

  for (let row = 0; row < 4; row++) {
    const ink = { left: sharedTextCanvasSize, top: sharedTextCanvasSize, right: -1, bottom: -1 };
    let covered = 0;
    let colorError = 0;

    for (let y = row * rowHeight; y < (row + 1) * rowHeight; y++) {
      for (let x = 0; x < sharedTextCanvasSize; x++) {
        const offset = (y * sharedTextCanvasSize + x) * 4;
        const r = pixels[offset]!;
        const g = pixels[offset + 1]!;
        const b = pixels[offset + 2]!;

        if (Math.max(r, g, b) < 80) {
          continue;
        }

        covered++;
        ink.left = Math.min(ink.left, x);
        ink.top = Math.min(ink.top, y);
        ink.right = Math.max(ink.right, x);
        ink.bottom = Math.max(ink.bottom, y);

        if (red) {
          colorError = Math.max(colorError, g, b);
        } else {
          colorError = Math.max(colorError, Math.abs(r - g), Math.abs(r - b));
        }
      }
    }

    expect(covered, `reader ${row}: real rendered ink`).toBeGreaterThan(40);
    expect(colorError, `reader ${row}: ${red ? 'red after shared paint mutation' : 'white fill'}`).toBeLessThan(4);
    bounds.push(ink);
  }

  return bounds;
};

/** Native Text in rows 0/1, RGBA BitmapText in rows 2/3, all sharing one style. */
export const exerciseSharedTextStyle = async (
  render: (root: Container) => Promise<ArrayLike<number>>,
  capture?: (state: 'initial' | 'layout-and-paint') => Promise<void>,
): Promise<void> => {
  const root = new Container();
  const style = new TextStyle({ fontFamily: 'sans-serif', fontSize, lineHeight: 1, fillColor: Color.white });
  const atlas = document.createElement('canvas');

  atlas.width = fontSize;
  atlas.height = fontSize;
  const context = atlas.getContext('2d')!;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, fontSize, fontSize);
  const texture = new Texture(atlas);
  const font = new BmFont(
    {
      pages: ['shared-style-atlas.png'],
      chars: new Map([[77, { x: 0, y: 0, width: fontSize, height: fontSize, xOffset: 0, yOffset: 0, xAdvance: fontSize, page: 0 }]]),
      kernings: new Map(),
      lineHeight: fontSize,
      base: fontSize,
    },
    [texture],
  );
  const readers = [new Text('MM\nMM'), new Text('MM\nMM'), new BitmapText('MM\nMM', font), new BitmapText('MM\nMM', font)];

  readers.forEach((reader, row) => {
    reader.style = style;
    reader.setPosition(24, row * rowHeight + 16);
    root.addChild(reader);
  });

  try {
    const before = inspectFrame(await render(root), false);

    for (const reader of readers) {
      expect(reader.style).toBe(style);
      expect(reader.textBounds.height).toBeCloseTo(fontSize * 2);
    }

    await capture?.('initial');
    const initialQuads = readers.map(reader => reader.pageQuads);

    style.lineHeight = 1.6;
    const laidOut = inspectFrame(await render(root), false);

    readers.forEach((reader, row) => {
      expect(reader.style).toBe(style);
      expect(reader.textBounds.height).toBeCloseTo(fontSize * 1.6 * 2);
      expect(reader.pageQuads).not.toBe(initialQuads[row]);
      expect(laidOut[row]!.bottom - before[row]!.bottom, `reader ${row}: second rendered line moved`).toBeGreaterThan(8);
    });

    const layouts = readers.map(reader => reader.currentLayout);
    const quads = readers.map(reader => reader.pageQuads);

    style.fillColor = Color.red;
    expect(inspectFrame(await render(root), true)).toEqual(laidOut);
    readers.forEach((reader, row) => {
      expect(reader.style).toBe(style);
      expect(reader.currentLayout, `reader ${row}: paint does not relayout`).toBe(layouts[row]);
      expect(reader.pageQuads).toBe(quads[row]);
    });
    await capture?.('layout-and-paint');
  } finally {
    root.destroy();
    texture.destroy();
  }
};
