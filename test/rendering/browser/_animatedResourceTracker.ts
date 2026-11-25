/** Counts decoders, VideoFrames and ImageBitmaps created while active, and how many are still open. */
export const createResourceTracker = (): {
  opened(): { decoders: number; frames: number; bitmaps: number };
  leaked(): { decoders: number; frames: number; bitmaps: number };
  restore(): void;
} => {
  const holder = globalThis as unknown as {
    ImageDecoder?: { prototype: { decode: (options: unknown) => Promise<{ image: { close(): void } }>; close(): void } };
    createImageBitmap: typeof createImageBitmap;
  };
  const counts = { decoders: 0, frames: 0, bitmaps: 0 };
  const open = { decoders: 0, frames: 0, bitmaps: 0 };
  const originals: Array<() => void> = [];

  const Decoder = holder.ImageDecoder;

  if (Decoder !== undefined) {
    const originalDecode = Decoder.prototype.decode;
    const originalClose = Decoder.prototype.close;
    const tracked = new WeakSet<object>();

    Decoder.prototype.decode = async function (this: object, options: unknown) {
      if (!tracked.has(this)) {
        tracked.add(this);
        counts.decoders++;
        open.decoders++;
      }

      const result = await originalDecode.call(this, options);
      const image = result.image;
      const close = image.close.bind(image);
      let closed = false;

      counts.frames++;
      open.frames++;

      image.close = (): void => {
        if (!closed) {
          closed = true;
          open.frames--;
        }

        close();
      };

      return result;
    };

    Decoder.prototype.close = function (this: object) {
      if (tracked.delete(this)) {
        open.decoders--;
      }

      originalClose.call(this);
    };

    originals.push(() => {
      Decoder.prototype.decode = originalDecode;
      Decoder.prototype.close = originalClose;
    });
  }

  const originalBitmap = holder.createImageBitmap;

  holder.createImageBitmap = (async (...args: Parameters<typeof createImageBitmap>) => {
    const bitmap = await originalBitmap(...args);
    const close = bitmap.close.bind(bitmap);
    let closed = false;

    counts.bitmaps++;
    open.bitmaps++;

    bitmap.close = (): void => {
      if (!closed) {
        closed = true;
        open.bitmaps--;
      }

      close();
    };

    return bitmap;
  }) as typeof createImageBitmap;
  originals.push(() => {
    holder.createImageBitmap = originalBitmap;
  });

  return {
    opened: () => ({ ...counts }),
    leaked: () => ({ ...open }),
    restore: () => originals.forEach(undo => undo()),
  };
};
