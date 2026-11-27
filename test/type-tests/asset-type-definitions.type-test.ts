import { type Application, textSourceCodec } from '@codexo/exojs';

class Tile {
  public constructor(public readonly width: number) {}
}

declare const app: Application;

app.assets.define(Tile, {
  type: 'tile',
  loader: { create: async bytes => new Tile(bytes.byteLength) },
});

app.assets.define(Tile, {
  type: 'tile',
  codec: textSourceCodec,
  loader: { create: async (source: string) => new Tile(source.length) },
});

// @ts-expect-error - a loader for another resource cannot define Tile.
app.assets.define(Tile, { type: 'tile', loader: { create: async () => ({ height: 0 }) } });

app.assets.define(Tile, {
  type: 'tile',
  // @ts-expect-error - a text codec cannot supply an ArrayBuffer loader's input.
  codec: textSourceCodec,
  loader: { create: async (source: ArrayBuffer) => new Tile(source.byteLength) },
});
