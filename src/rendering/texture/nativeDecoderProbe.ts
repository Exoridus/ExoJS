import type { AnimatedImageMime } from './animatedImageMime';

/**
 * Three-frame, 4x1 animations that exercise the composition rules a native
 * decoder most often gets wrong: disposal to background (frame 1 is cleared
 * before frame 2), for APNG and WebP the "source" blend that replaces pixels
 * instead of blending them (frame 2 is half transparent white), and decoding
 * the first frame again after walking the sequence, which playback does on every
 * loop (frame 0 is opaque blue and must not inherit frame 2).
 */
const gifProbe =
  'R0lGODlhBAABAPAAAAAA/wAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQECgAAACwAAAAABAABAAACAoRRACH5BAgKAAAALAAAAAACAAEAgAD/AAAAAAICBAoAIfkEBAoAAAAsAgAAAAIAAQCAAAAA////AgJMCgA7';
const pngProbe =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAABCAYAAAD5PA/NAAAACGFjVEwAAAADAAAAAM7tusAAAAAaZmNUTAAAAAAAAAAEAAAAAQAAAAAAAAAAAGQD6AAAjfTudwAAAA9JREFUeJxjYGD4/x8ZAwA71Qf5T2UxlgAAABpmY1RMAAAAAQAAAAIAAAABAAAAAAAAAAAAZAPoAQCSQD7xAAAAEGZkQVQAAAACeJxjYPgPgQAP+QP9uA9eWQAAABpmY1RMAAAAAwAAAAIAAAABAAAAAgAAAAAAZAPoAAA+oWWYAAAAE2ZkQVQAAAAEeJxj+P//fwMIAwAg6wb7w5cWHwAAAABJRU5ErkJggg==';
const webpProbe =
  'UklGRrYAAABXRUJQVlA4WAoAAAASAAAAAwAAAAAAQU5JTQYAAAD/////AABBTk1GKAAAAAAAAAAAAAMAAAAAAGQAAAJWUDhMDwAAAC8DAAAABxDR//4HIqL/AQBBTk1GKAAAAAAAAAAAAAEAAAAAAGQAAANWUDhMDwAAAC8BAAAAB9D/iP4HIqL/AQBBTk1GKgAAAAEAAAAAAAEAAAAAAGQAAAJWUDhMEQAAAC8BAAAAB9D//ve/gIGI6H8AAA==';

const probeFor = (type: AnimatedImageMime): string => {
  switch (type) {
    case 'image/gif':
      return gifProbe;
    case 'image/png':
      return pngProbe;
    case 'image/webp':
      return webpProbe;
  }
};

/** Whether the format carries partial alpha, so the blend rule is observable. */
const hasPartialAlpha = (type: AnimatedImageMime): boolean => type !== 'image/gif';

interface ProbeDecoder {
  readonly tracks: { readonly ready: Promise<void> };
  decode(options: { frameIndex: number }): Promise<{ image: VideoFrame }>;
  close(): void;
}

type ProbeDecoderConstructor = new (options: { data: Uint8Array; type: string }) => ProbeDecoder;

const cache = new Map<string, Promise<boolean>>();

const run = async (decoderClass: ProbeDecoderConstructor, type: AnimatedImageMime): Promise<boolean> => {
  if (typeof OffscreenCanvas === 'undefined') {
    // Without a way to read pixels back there is nothing to verify; trust the decoder.
    return true;
  }

  const decoder = new decoderClass({ data: Uint8Array.from(atob(probeFor(type)), char => char.charCodeAt(0)), type });

  try {
    await decoder.tracks.ready;

    const read = async (frameIndex: number): Promise<Uint8ClampedArray | null> => {
      const { image } = await decoder.decode({ frameIndex });

      try {
        const context = new OffscreenCanvas(4, 1).getContext('2d', { willReadFrequently: true });

        if (context === null) {
          return null;
        }

        context.drawImage(image, 0, 0);

        return context.getImageData(0, 0, 4, 1).data;
      } finally {
        image.close();
      }
    };

    // Decoded in playback order, because some engines only go wrong when a loop returns to frame 0 after walking the whole sequence.
    await read(0);
    await read(1);

    const last = await read(2);
    const first = await read(0);

    if (last === null || first === null) {
      return true;
    }

    const disposedToBackground = last[3]! < 16;
    const blendedAsAuthored = !hasPartialAlpha(type) || (last[11]! > 100 && last[11]! < 160);
    const restartsCleanly = first[2]! > 200 && first[3]! > 200;

    return disposedToBackground && blendedAsAuthored && restartsCleanly;
  } catch {
    return false;
  } finally {
    decoder.close();
  }
};

/**
 * Checks once per format that the browser's ImageDecoder composes frames as
 * the file format specifies. Detecting the defect by behavior instead of by
 * user agent keeps the check correct as browsers fix or regress it.
 * @internal
 */
export const isNativeDecoderFaithful = (decoderClass: ProbeDecoderConstructor, type: AnimatedImageMime): Promise<boolean> => {
  let result = cache.get(type);

  if (result === undefined) {
    result = run(decoderClass, type);
    cache.set(type, result);
  }

  return result;
};
