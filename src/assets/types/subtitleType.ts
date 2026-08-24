import type { AssetConstructor } from '#assets/AssetConstructor';
import type { AssetFactory } from '#assets/AssetFactory';
import type { AssetSourceCodec } from '#assets/AssetSourceCodec';
import { AssetType } from '#assets/AssetType';
import { parseSubtitles, subtitleFormatOf, type SubtitleSource } from '#assets/factories/parseSubtitles';
import { SubtitleAsset } from '#assets/tokens';

/**
 * WebVTT and SubRip subtitle tracks, parsed into `VTTCue`s.
 *
 * One type reads both: the format is a property of the file, taken from its
 * suffix, and an unrecognised suffix reads as WebVTT.
 */
export class SubtitleAssetType extends AssetType<SubtitleSource, VTTCue[], undefined, string> {
  public readonly id = 'subtitle';
  public override readonly extensions = ['vtt', 'srt'];
  public override readonly _token: AssetConstructor = SubtitleAsset;
  public override readonly codec: AssetSourceCodec<SubtitleSource, string> = {
    fromResponse: response => response.text(),
    fromBytes: bytes => Promise.resolve(new TextDecoder().decode(bytes)),
    decode: (stored, context) => Promise.resolve({ fmt: subtitleFormatOf(context.locator), text: stored }),
  };

  public createFactory(): AssetFactory<SubtitleSource, VTTCue[]> {
    return { create: source => Promise.resolve(parseSubtitles(source)) };
  }
}

/** The built-in `subtitle` asset type, covering both `.vtt` and `.srt`. */
export const subtitleType = new SubtitleAssetType();
