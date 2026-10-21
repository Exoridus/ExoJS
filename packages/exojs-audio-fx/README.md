# @codexo/exojs-audio-fx

Audio effects, spectrum analysis, worklet-backed processing, and beat detection for ExoJS. Core already provides audio assets, voices, buses, and basic routing. Add this package when a project needs analysis or the additional effect processors.

## Install

```sh
npm install --save-exact @codexo/exojs @codexo/exojs-audio-fx
```

Core is a peer dependency. Construct the required objects directly; there is no application extension descriptor to install for ordinary audio analysis.

## Inspect a live music bus

This helper expects an initialized application with audio already playing on its music bus. It does not load or start a track:

```ts
import type { Application } from '@codexo/exojs';
import { AudioAnalyser } from '@codexo/exojs/audio-fx';

export const inspectMusic = (app: Application): { read: () => Uint8Array; destroy: () => void } => {
  const analyser = new AudioAnalyser({ source: app.audio.music, fftSize: 1024 });

  return {
    read: () => analyser.getSpectrumLog(undefined, { bands: 16 }),
    destroy: () => analyser.destroy(),
  };
};
```

Call `read` from the owner's update path and destroy the helper when that owner ends. An analyser taps a live bus or voice, not an unloaded asset descriptor. A silent or muted routing path is not repaired by repeatedly creating analysers.

## Externally produced PCM

Use `PcmStreamSource` for bounded mono/stereo Float32 streaming into an `AudioBus`. Await readiness, enqueue at the source's sample rate, then explicitly start playback; caller-owned arrays are copied and remain reusable. See [the PCM contract and lifecycle guide](docs/pcm-streaming.md) and [the runnable streaming example](../../examples/audio-fx/pcm-stream.ts) for scheduling, overflow, underrun telemetry, clear and drain.

For GPU-generated samples, the [GPU stereo PCM guide](docs/gpu-pcm.md) and [example](../../examples/audio-fx/gpu-pcm-stream.ts) connect bounded readback slots to the source, with explicit byte packing or typed float readback on both rendering backends.

## Important boundaries

Browser audio needs a real user-gesture path. Worklet-backed processors can have asynchronous initialization and capability requirements; handle failure and teardown rather than assuming construction means readiness.

Effects, analyser nodes, detectors, and playing voices have distinct lifetimes. Track caller-created resources with their scene or dispose them at their own boundary. Do not leave a detector connected merely because its visual widget was removed.

Beat detection estimates tempo and phase. Polling windows such as `justBeat` are not one-shot events, and asynchronous messages are not hard real-time delivery. A rhythm-game scoring timeline needs an explicit authoritative timing design. Analysis values are not a calibrated acoustic loudness measurement.

Assigning a different `BeatDetector.source` clears analysis history and pending predictions. Call `detector.reset()` after a seek or another playback discontinuity on the same source; reassigning that same source preserves continuity. Disconnected inputs and gaps in the context-frame stream also reset analysis. Recorded silence is processed as audio and expires predictions without assuming a source change. Use `notifyDiscontinuity('eof')` or `notifyDiscontinuity('explicitPause')` to stop analysis explicitly; `resume`, `reset()` or another source identity starts a new epoch. Seek, loop and starvation notifications clear history while preserving an explicit stop. Changing manual context also preserves that stop.

`predictionValidUntil` is the audio-context time at which a retained prediction schedule must be discarded, or 0 when unavailable. Without renewed onset support, validity lasts two tracked beat periods plus one FFT window. `lookahead` becomes empty after expiry, and unavailable `nextBeatTime` and `nextDownbeatTime` return 0. Later times in the eight-beat extrapolation remain conditional; retaining an array does not extend its validity. `onBeatPredicted` announces each received revision at most once and does not coalesce queued revisions. The immutable `schedule` view adds epoch/revision, generation/evidence times, conditional horizon, pulse period and the trust status at generation. It is null when expired. Its `nextBeat` and `nextDownbeat` are future entries or null, including when a manual boundary lies beyond the horizon. A retained snapshot containing downbeats expires with its meter interpretation; a fresh view may retain beat-only predictions until their separate deadline.

`meterEstimate` is an immutable view with `selected`, at most two `alternatives`, an uncalibrated `score`, `reason`, `origin` and audio-context validity times. `selected: null` means no supported cycle; `selected.phasePulses: null` means a cycle without an anchored downbeat. The selected model contains `cyclePulses`, `pulsePeriodSeconds`, `phasePulses` and `denominator`. Automatic detection considers three/four pulses and never infers a notated denominator. `meterKnown` requires both a valid cycle and phase. Unknown or expired phase suppresses automatic downbeats, bar-start events and lookahead downbeat flags; beat effects can continue.

Use `manualMeter: { cyclePulses: 3, phasePulses: 0, denominator: 4 }` to provide counting context, anchored at the first tracked beat after reset (`origin: 'manual'`). Omit phase to keep the cycle unanchored. The runtime `manualMeter` setter snapshots and validates its input, resets analysis when changed and accepts `null` to resume automatic detection. Configuration survives reset/source changes; the phase anchor is established anew. `enableTimeSignatureDetection: false` instead supplies a fixed four-beat convention (`origin: 'convention'`). Manual cycles support 1..32 pulses; an upcoming boundary outside the eight-entry lookahead remains unavailable rather than becoming the next beat.

`barPosition`, `barLength` and `timeSignature` are legacy display values when meter is unknown. Their denominator defaults to the convention 4 unless provided manually. `beatConfidence` separates the pulse score from the legacy meter factor; `confidence` and its lock behavior retain that factor, and `gridStability` remains its legacy alias. None is a calibrated probability. `BeatInfo.energy` retains raw novelty from the emission hop; the separate `onsetEnergy` and `onsetAudioTime` describe the associated onset or are null without a match. Cached rhythm getters expire against the audio-context clock even without another worklet message.

The [meter model and interpretation contract](docs/meter-estimation.md) describes the compact candidate and its limits. Automatic cycle/downbeat quality is experimental; a locked tempo does not establish musical bar accuracy.

## Documentation

[Audio basics](https://exoridus.github.io/ExoJS/en/guide/audio/audio-basics/) · [Effects and routing](https://exoridus.github.io/ExoJS/en/guide/audio/audio-effects/) · [Beat detection](https://exoridus.github.io/ExoJS/en/guide/audio/beat-detection/) · [Audio-reactive visuals](https://exoridus.github.io/ExoJS/en/guide/audio/audio-reactive-visualization/) · [AudioAnalyser API](https://exoridus.github.io/ExoJS/en/api/audio-analyser/)

## Beat evaluation

[The synthetic MIR evaluation](docs/mir-evaluation.md) documents reproducible quality and posting-latency measurements, adversarial fixtures, provisional-versus-locked comparisons, and their limits. Run the named evaluation test from the repository root; no external audio dataset is required.

[The recorded music corpus](test/fixtures/music/README.md) complements it with five committed CC0 excerpts. Its tests run offline and distinguish unreviewed beat proposals from reviewed references; passing integration checks alone does not establish accuracy on music.

## License

MIT
