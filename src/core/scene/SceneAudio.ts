import type { Pausable, Playable, PlayOptions, Voice } from '#audio/Playable';
import type { Application } from '#core/Application';
import type { Destroyable } from '#core/types';

const isPausable = (voice: Voice): voice is Voice & Pausable => 'pause' in voice && 'resume' in voice;

/**
 * Scene-bound audio facade. Playback started or added here uses scene
 * lifetime: every tracked {@link Voice} is stopped when the owning scene ends
 * permanently. Access via {@link Scene.audio}.
 *
 * Delegates entirely to `app.audio` — no second audio graph, just tracking of
 * what this facade started so it can stop it on teardown (and, for capable
 * voices, pause/resume it across retention suspension). Gating playback
 * requested while the scope is `Preparing` is introduced by a later slice.
 */
export class SceneAudio implements Destroyable {
  private readonly _tracked = new Set<Voice>();
  private _suspended: Set<Voice & Pausable> | null = null;

  public constructor(private readonly _app: Application) {}

  /** Play `source` through the application audio manager and track the resulting {@link Voice} for scene-lifetime cleanup. */
  public play(source: Playable, options?: PlayOptions): Voice {
    return this.add(this._app.audio.play(source, options));
  }

  /** Track an already-created {@link Voice} (e.g. from `app.audio.play(...)`) for scene-lifetime cleanup. Returns it unchanged. */
  public add(voice: Voice): Voice {
    this._tracked.add(voice);

    return voice;
  }

  /**
   * Pause every tracked, currently-playing {@link Pausable} voice, recording
   * exactly that set so {@link SceneAudio.resume} can restore it. Reserved
   * for retention suspension — voices without pause support are left
   * playing, matching the definition's "suspended where supported" contract.
   * @internal
   */
  public suspend(): void {
    const playing = new Set<Voice & Pausable>();

    for (const voice of this._tracked) {
      if (!voice.ended && isPausable(voice) && !voice.paused) {
        voice.pause();
        playing.add(voice);
      }
    }

    this._suspended = playing;
  }

  /** Resume exactly the voices paused by {@link SceneAudio.suspend}. @internal */
  public resume(): void {
    if (this._suspended === null) {
      return;
    }

    for (const voice of this._suspended) {
      if (!voice.ended) {
        voice.resume();
      }
    }

    this._suspended = null;
  }

  public destroy(): void {
    for (const voice of this._tracked) {
      voice.stop();
    }

    this._tracked.clear();
    this._suspended = null;
  }
}
