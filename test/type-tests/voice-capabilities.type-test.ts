import type { AudioBus } from '#audio/AudioBus';
import type { AudioGenerator } from '#audio/AudioGenerator';
import type { AudioSend } from '#audio/AudioSend';
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

// Deferred handles keep the same graph types as active ones. Reading output
// before a real voice exists throws; it never returns null or a substitute.
const sceneOutputs: AudioNode[] = [sceneSound.output, sceneStream.output, sceneGenerator.output, sceneCustom.output];
const soundSend: AudioSend = sceneSound.addSend(sceneSound.bus, 0.5);
const streamSend: AudioSend = sceneStream.addSend(sceneStream.bus, 0.5);
const generatorSend: AudioSend = sceneGenerator.addSend(sceneGenerator.bus, 0.5);
const customSend: AudioSend = sceneCustom.addSend(sceneCustom.bus, 0.5);

for (const send of [soundSend, streamSend, generatorSend, customSend]) {
  const level: number = send.level;
  const bus: AudioBus = send.bus;
  const destroyed: boolean = send.destroyed;

  send.level = level + 0.25;
  // @ts-expect-error A send level is numeric.
  send.level = '0.5';
  // @ts-expect-error A send's target bus is fixed for its lifetime.
  send.bus = bus;
  // @ts-expect-error Only destroy() changes the send's destroyed state.
  send.destroyed = destroyed;
  send.destroy();
}

const cachedSoundSends = sceneSound.sends;
const cachedStreamSends = sceneStream.sends;
const cachedGeneratorSends = sceneGenerator.sends;
const cachedCustomSends = sceneCustom.sends;
const cachedSendViews: ReadonlyArray<readonly AudioSend[]> = [cachedSoundSends, cachedStreamSends, cachedGeneratorSends, cachedCustomSends];

// @ts-expect-error A cached Sound send view cannot be mutated by the caller.
cachedSoundSends.push(soundSend);
// @ts-expect-error A cached stream send view cannot be mutated by the caller.
cachedStreamSends.push(streamSend);
// @ts-expect-error A cached generator send view cannot be mutated by the caller.
cachedGeneratorSends.push(generatorSend);
// @ts-expect-error A cached custom-source send view cannot be mutated by the caller.
cachedCustomSends.push(customSend);
// @ts-expect-error The voice owns its send collection.
sceneStream.sends = [];
// @ts-expect-error The voice owns its output node.
sceneStream.output = sceneOutputs[0]!;

void cachedSendViews;

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
