import { Asset } from '#assets/Asset';
import { AssetDecodeError } from '#assets/AssetDecodeError';
import type { AssetDependencyScope } from '#assets/AssetFactory';
import type { AudioSpriteClip } from '#audio/Sound';

/**
 * Contents of a sound sprite sidecar: the same shape
 * {@link SoundAssetOptions.sprites} accepts inline, as a standalone JSON
 * document.
 *
 * ```json
 * { "impact": { "start": 0.5, "end": 0.8 }, "hum": { "start": 1.2, "end": 4.0, "loop": true } }
 * ```
 *
 * Times are seconds into the decoded buffer. This is ExoJS's own descriptor and
 * the only format the loader reads: `audiosprite` and Howler atlases store
 * `[offsetMs, durationMs]` tuples and are converted once at build time, not on
 * every load.
 */
export type SoundSpriteSheet = Readonly<Record<string, AudioSpriteClip>>;

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const fail = (source: string, detail: string): never => {
  throw new AssetDecodeError({ message: `Invalid sound sprite sheet "${source}": ${detail}.`, assetType: 'sound' });
};

/**
 * Loads and validates a sound sprite sidecar through `scope`, so the sidecar's
 * residency is tied to the sound that references it.
 *
 * `source` is an ordinary asset source resolved against the loader's base path,
 * exactly like the sound's own - not a path relative to the audio file. Both
 * halves of one sound are addressed the same way.
 * @internal
 */
export const loadSoundSpriteSheet = async (source: string, scope: AssetDependencyScope): Promise<SoundSpriteSheet> => {
  const data: unknown = await scope.load(Asset.type('json', source));

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    fail(source, 'expected an object mapping sprite names to clips');
  }

  const sheet: Record<string, AudioSpriteClip> = {};

  for (const [name, clip] of Object.entries(data as Record<string, unknown>)) {
    if (clip === null || typeof clip !== 'object') {
      fail(source, `the entry "${name}" is not a clip object`);
    }

    const { start, end, loop } = clip as { start?: unknown; end?: unknown; loop?: unknown };

    if (!isFiniteNumber(start) || !isFiniteNumber(end)) {
      fail(source, `the entry "${name}" needs finite "start" and "end" times in seconds`);
    }

    if (loop !== undefined && typeof loop !== 'boolean') {
      fail(source, `the entry "${name}" has a non-boolean "loop"`);
    }

    sheet[name] = { start: start as number, end: end as number, ...(loop !== undefined && { loop: loop as boolean }) };
  }

  return sheet;
};
