# GPU stereo PCM

The [GPU stereo PCM example](../../../examples/audio-fx/gpu-pcm-stream.ts) connects a GPU sound function to asynchronous `PixelReader` readback, `PcmStreamSource`, and the application's music bus on WebGL2 and WebGPU. Press Start to resume the audio context, prebuffer samples, and schedule playback. Pause production to observe starvation, drain to finish the generated blocks, or create a new stream. Changing format cancels the old stream and requires another Start.

The GLSL function uses the native BlinkFX audio function shape `vec2 renderSound(float timeSeconds, int sampleIndex)`, with a manually authored WGSL equivalent. The example generates 220 Hz left and 330 Hz right at the AudioContext sample rate. The wrapper supplies absolute sample index and time; it never derives sample time from animation delta. This demonstrates the sound-function contract, not package loading, shader conversion, or a complete BlinkFX runtime. Those remain application responsibilities. Shader scalar precision still limits very long-running synthesis; this small tone demonstration is not a long-duration synthesizer.

## Explicit sample encoding

Each pixel represents one stereo frame, with a 1024-by-1 target per block. The user explicitly selects an encoding. Unsupported formats are reported without silently changing the choice.

| Target    | Readback                                  | Consumer decoding                                                                                       |
| --------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `rgba8`   | Default `Uint8ClampedArray`               | Left in R/G, right in B/A, high byte first. Decode each unsigned 16-bit word as `word / 65535 * 2 - 1`. |
| `rgba32f` | `{ dataType: 'float32' }`, `Float32Array` | R is left, G is right; B/A are unused.                                                                  |
| `rgba16f` | `{ dataType: 'float32' }`, `Float32Array` | Same channel layout; Core expands stored half-float values to Float32 without restoring lost precision. |

The byte path explicitly clips to `[-1, 1]`, quantizes to unsigned 16-bit words, and packs them in the shader. Core does none of that audio conversion. The fullscreen `ShaderFilter` writes without alpha blending, because the fourth byte is sample data. Byte packing has at most `1 / 65535` sample error before shader arithmetic; float16 adds half-float quantization. Float32 carries the shader's native floating-point result.

## Bounded production and ownership

There are two readback slots, an 8192-frame PCM capacity, and a 100 ms lookahead target rounded up to a whole 1024-frame block and capped at capacity. The producer reserves one block of queue space for every pending read. Its scheduling condition is `bufferedFrames + pendingBlocks * blockFrames + blockFrames <= targetFrames`. At 48 kHz, the target is 5120 frames, about 106.7 ms. These sizes are example policy, not engine defaults or a latency guarantee.

Readback results are accepted in submission order. A full audio queue retains the finished read in its existing slot until it can enqueue, so there is no extra retry queue. `enqueuePlanar` copies synchronously; only after acceptance does the example release the readback slot. Drain stops generation, accepts pending blocks, and then closes the PCM source. Scene destruction, restart, or failure destroys the reader and source before releasing render targets and the shader.

The UI separates generated, accepted, and played frames, PCM occupancy, readback slots, observed readback wait, overflow, and starvation. The reported wait includes frame polling and main-thread delays; it is not a GPU-only timing. Total audible latency also includes lookahead, the start lead, browser audio buffering, and device latency. Hidden tabs and main-thread stalls can exhaust the lookahead; the worklet emits silence and reports starvation instead of waiting.

## Browser proof

The named `webgl2-gpu-pcm.test.ts` and `webgpu-gpu-pcm.test.ts` browser tests read the exact shader bodies from the example. For each format they render four sequential 1024-frame blocks, refuse a third simultaneous readback request, release and reuse both slots, and pass the decoded blocks through the production PCM AudioWorklet in an `OfflineAudioContext` at 48 kHz. They compare every stereo output sample, including block boundaries, against the CPU sine reference, verify the scheduled first sample at index 174, verify the silent prefix and drained tail, and require zero underrun frames. Tolerances are `0.00004` for packed bytes/float32 and `0.0001` for float16.

These tests prove sample transport and scheduled offline output. They do not measure speaker latency or guarantee starvation-free realtime playback. The catalog example separately exercises the public source and bus lifecycle in a live AudioContext.

```sh
pnpm exec vitest run --project=browser-webgl-chromium test/rendering/browser/webgl2-gpu-pcm.test.ts
pnpm exec vitest run --project=browser-webgpu test/rendering/browser/webgpu-gpu-pcm.test.ts
```
