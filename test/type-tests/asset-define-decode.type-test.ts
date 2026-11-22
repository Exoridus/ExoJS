import type { Application } from '../../src/index';

declare const app: Application;

class Level {
  public constructor(public readonly size: number) {}
}

class Notes {
  public constructor(public readonly text: string) {}
}

class Clip {
  public constructor(public readonly blob: Blob) {}
}

app.assets.define(Level, { type: 'level', extensions: ['level'], decode: bytes => new Level(bytes.byteLength) });
app.assets.define(Level, {
  type: 'level',
  decode: async (bytes, { signal }) => (signal?.aborted ? new Level(0) : new Level(bytes.byteLength)),
});
app.assets.define(Notes, { type: 'notes', read: 'text', decode: text => new Notes(text.trim()) });
app.assets.define(Notes, { type: 'notes', read: 'json', decode: data => new Notes(String(data)) });
app.assets.define(Clip, { type: 'clip', read: 'blob', decode: blob => new Clip(blob), dispose: clip => void clip.blob });

// @ts-expect-error - decode must produce the defined class.
app.assets.define(Level, { type: 'level', decode: () => new Notes('') });
// @ts-expect-error - text is not an ArrayBuffer.
app.assets.define(Level, { type: 'level', read: 'text', decode: (bytes: ArrayBuffer) => new Level(bytes.byteLength) });
// @ts-expect-error - a definition needs decode or a loader.
app.assets.define(Level, { type: 'level' });
// @ts-expect-error - decode and a loader are mutually exclusive.
app.assets.define(Level, { type: 'level', decode: () => new Level(1), loader: { create: async () => new Level(1) } });
// @ts-expect-error - an unknown read kind.
app.assets.define(Level, { type: 'level', read: 'stream', decode: () => new Level(1) });
