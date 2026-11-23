import { MediaAudio } from './MediaAudio';

/**
 * A finite music track: background music, ambience loops, voice-over.
 *
 * The browser streams and decodes it progressively, so playback can start at
 * `canplay` long before the whole file has arrived. Its duration is known once
 * metadata has loaded, and voices can seek and loop.
 *
 * Load it with `assets.load([Music, 'theme.ogg'])` and play it with
 * `audio.play(music, { loop: true })`. Use {@link AudioStream} for a live or
 * unbounded source such as internet radio, and {@link Sound} for short clips.
 */
export class Music extends MediaAudio {
  /** `true` for a finite track; seeking past the buffered range makes the browser fetch from there. */
  public get seekable(): boolean {
    return true;
  }
}
