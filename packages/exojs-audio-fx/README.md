# @codexo/exojs-audio-fx

Audio effects, DSP, beat detection, and analysis for [ExoJS](https://github.com/Exoridus/ExoJS).

A peer-dependency library on top of `@codexo/exojs`. Core ships the audio engine
(buses, voices, the `AudioEffect`/`WorkletEffect` bases, and the native
`BiquadEffect`); this package adds the richer effects plus analysis tooling:

- **Effects** — `ReverbEffect`, `DelayEffect`, `ChorusEffect`, `CompressorEffect`,
  `EqualizerEffect`, `GranularEffect`, `PitchShiftEffect`, `VocoderEffect`,
  `DuckingEffect`. Insert on a bus (`bus.addEffect(fx)`) or a voice
  (`voice.addEffect(fx)`).
- **Analysis** — `AudioAnalyser` (spectrum / waveform / mel-log mapping) and
  `BeatDetector` (real-time tempo + beat tracking).

```ts
import { ReverbEffect, AudioAnalyser } from '@codexo/exojs-audio-fx';

app.audio.music.addEffect(new ReverbEffect({ wet: 0.4 }));
const analyser = new AudioAnalyser({ source: app.audio.music });
```

## License

MIT
