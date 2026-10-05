import type { AudioGenerator } from '#audio/AudioGenerator';
import type { AudioStream } from '#audio/AudioStream';
import type { AudioSystem } from '#audio/AudioSystem';
import type { Loopable, Pausable, Playable, RatePitched, Seekable, Voice } from '#audio/Playable';
import type { Sound } from '#audio/Sound';
import type { SceneAudio } from '#core/scene/SceneAudio';
import { SceneAvailability } from '#core/scene/SceneAvailability';

declare const sceneAudio: SceneAudio;
declare const system: AudioSystem;
declare const sound: Sound;
declare const stream: AudioStream;
declare const generator: AudioGenerator;
declare const custom: Playable;

type FullVoice = Voice & Seekable & Pausable & Loopable & RatePitched;

// Sound: one capability check narrows to the full voice surface, whether the
// scene is active or the voice is still deferred.
const sceneSound = sceneAudio.play(sound, { when: SceneAvailability.Active });
const sceneSoundAsVoice: Voice = sceneSound;

if ('seek' in sceneSound) {
  const full: FullVoice = sceneSound;

  full.seek(1);
  sceneSound.pause();
  sceneSound.resume();
  sceneSound.loop = true;
  sceneSound.playbackRate = 2;
}

// @ts-expect-error A Sound voice may be an already-ended placeholder; narrow before seeking.
sceneSound.seek(1);
// @ts-expect-error A Sound voice may be an already-ended placeholder; narrow before pausing.
sceneSound.pause();

const sceneStream = sceneAudio.play(stream);

if ('pause' in sceneStream) {
  sceneStream.seek(2);
  sceneStream.pause();
  const streamTime: number = sceneStream.time;

  void streamTime;
}

// AudioGenerator: pausable and rate-pitched, never seekable or loopable.
const sceneGenerator = sceneAudio.play(generator);

if ('pause' in sceneGenerator) {
  const pausable: Voice & Pausable & RatePitched = sceneGenerator;

  pausable.pause();
  sceneGenerator.detune = 5;
  // @ts-expect-error A generator voice cannot seek.
  sceneGenerator.seek(1);
  // @ts-expect-error A generator voice cannot loop.
  sceneGenerator.loop = true;
  // @ts-expect-error A generator voice is not Seekable.
  const notSeekable: Voice & Seekable = sceneGenerator;

  void notSeekable;
}

if ('seek' in sceneGenerator) {
  // @ts-expect-error No generator voice promises a callable seek.
  sceneGenerator.seek(1);
}

// A Playable that is not one of the built-in assets promises only the base Voice.
const sceneCustom: Voice = sceneAudio.play(custom);

if ('seek' in sceneCustom) {
  // @ts-expect-error An unknown Playable gives no seek promise.
  sceneCustom.seek(1);
}

// AudioSystem.play carries the same source-appropriate surface.
const systemSound = system.play(sound, { replace: true });

if ('seek' in systemSound) {
  systemSound.seek(1);
  systemSound.pause();
}

const systemGenerator = system.play(generator);

if ('pause' in systemGenerator) {
  systemGenerator.pause();
  // @ts-expect-error A generator voice cannot seek.
  systemGenerator.seek(1);
}

// An AudioStream always yields a stream voice, so it needs no capability check.
const systemStream: FullVoice = system.play(stream);

systemStream.seek(1);
sceneAudio.play(stream).pause();

export { sceneSoundAsVoice };
