# Streaming PCM

`PcmStreamSource` lives in `@codexo/exojs-audio-fx`. It feeds externally generated PCM through an AudioWorklet into a Core `AudioBus`; Core has no dependency on this package. No application extension descriptor is needed.

```ts
import { getAudioContext } from '@codexo/exojs';
import { PcmStreamSource } from '@codexo/exojs-audio-fx';

const stream = new PcmStreamSource({ channels: 2, capacityFrames: 8192, bus: app.audio.music });
await stream.ready;
// Produce at stream.sampleRate. Each channel has the same frame count.
stream.enqueuePlanar([left, right]);
// Call from an unlocked audio path; choose lead time in the application.
stream.start(getAudioContext().currentTime + 0.02);
// Later: stop writing and drain, or destroy immediately during teardown.
stream.close();
```

The runnable [PCM streaming example](../../../examples/audio-fx/pcm-stream.ts) synthesizes stereo tones, keeps a caller-selected queue target, displays telemetry, and lets you interrupt production, clear, drain, and restart. Its buffering target is an example policy, not an engine default.

## Format and ownership

- Fixed one or two channels at the shared `AudioContext.sampleRate`; no implicit resampling. Convert other sample rates before enqueueing.
- `enqueuePlanar` accepts equal-length `Float32Array` channels. `enqueueInterleaved` accepts mono frames or stereo `L,R,L,R` frames. A frame contains one sample per channel.
- Finite samples only; nominal full scale is `[-1, 1]`. The source neither clips nor normalizes. Out-of-range finite values survive into the audio graph.
- Accepted blocks are copied synchronously, then the private copy is transferred. Caller arrays, views, buffers and readback slots remain caller-owned and can be reused immediately. Shared buffers must not be mutated concurrently with the copy.
- The output gain node belongs to the source. Bus assignment changes only its bus edge, preserving separately connected analysis taps. The source does not own its bus, effects or shared audio context.

## Bounded queue and telemetry

`capacityFrames` defaults to 8192 and accepts integers from 1 to 1048576. It bounds outstanding frames across the main-thread transport and the worklet, not just frames that have reached the ring. The worklet allocates one ring per channel and never waits for the producer. Input payloads are copied into that ring and not retained afterwards. Small writes also remain bounded because every nonempty message consumes at least one frame of capacity.

The boolean enqueue result accepts or refuses the whole block; no partial writes, retries or hidden backlog. Capacity overflow increments `overflowCount` and `droppedFrames`, leaves queued audio intact, and does not detach caller data. Empty input succeeds without sending a message. Invalid layouts or nonfinite samples in an otherwise admissible block throw `RangeError`. Writes before readiness, during a pending clear, or after closing/failure/destruction return `false` without counting as overflow.

`bufferedFrames` is submitted minus acknowledged consumed/discarded frames. It includes transport and may conservatively overstate actual occupancy. `bufferedSeconds` divides that value by the context sample rate; it excludes device latency. `enqueuedFrames` counts lifetime accepted frames. `highWaterFrames` records the largest transport-inclusive `bufferedFrames` after an accepted write, never exceeding `capacityFrames`; it is a conservative producer-side peak, not a measurement of the worklet ring alone. Refused, invalid, empty or failed-transfer writes do not increase either counter. Both remain available after clear, close, failure or destroy.

`playedFrames`, `underrunFrames` and `underruns` are cumulative worklet reports. Ordinary telemetry has at most one message outstanding until acknowledgment, so a stalled main thread cannot accumulate unbounded reports. There is no fixed telemetry freshness guarantee; a producer must tolerate refused writes and delivery jitter.

## Scheduling and lifecycle

Construction loads the worklet and creates an idle source. `ready` can resolve while autoplay still blocks audio; it does not resume the context. Module failures reject readiness and report through `onError`. Destroy during loading rejects readiness with `AbortError` and prevents later node creation.

After prebuffering, call `start(time)` once. The absolute context timestamp defaults to now, rounds up to a sample boundary and sets the earliest first sample. A command received after that timestamp starts at the next available render quantum; old samples are not dropped. There are no per-block timestamps or implicit scheduling offsets. `start` returns false unless the source is ready and has not started.

Once started, insufficient data produces silence and increments `underrunFrames`; `underruns` counts contiguous starvation episodes. Input arriving later resumes FIFO playback. Idle time before start and context suspension are not underruns. Browser suspension freezes the context clock and preserves the bounded queue; clear it if the application considers its content stale.

`clear()` discards pending samples when the worklet receives the command and preserves the start schedule and lifetime counters. It cannot recall samples already rendered. Repeated calls coalesce, and writes are refused until `clearing` becomes false on acknowledgment. Credits are retained until acknowledgment, preventing repeated clears from bypassing the transport bound.

`close()` refuses new writes and drains the queue, starting immediately if never started or preserving an existing scheduled start. Its final silent tail is not an underrun. It transitions through `closing` to `closed`, releases nodes/port and fires `onEnd` once. Drain needs a processing context and connected output graph; a suspended context cannot finish it. `destroy()` cancels immediately and is idempotent; it never fires `onEnd`. Processor errors or a closed context transition to `failed`, release resources and report `onError`. Terminal sources cannot restart; create a new instance.

The source has its own lifetime. Destroy it before its owning scene/application ends; destroying an `AudioBus` or `AudioSystem` does not destroy external sources. Mute and effects belong on the bus. For immediate cancellation use `destroy`, not a drain that may wait on autoplay or suspension.

## Realtime AV and readback boundary

Core `PixelReader` and `RenderingContext.readPixels` return top-row-first RGBA data on WebGL2 and WebGPU. The default mode returns `Uint8ClampedArray` from `rgba8` targets. Explicit `{ dataType: 'float32' }` reads `rgba32f` or `rgba16f` targets into `Float32Array`, preserving signed values and values outside the display range. Half-float targets retain their stored precision even though the returned array is Float32. Byte mode rejects float targets; float mode rejects byte targets. No implicit normalization or fallback occurs.

Check `app.rendering.supportsReadbackFormat(format)` before selecting a target. Renderability alone is not the readback capability contract. A one-shot read owns its result; a standing reader owns its pooled array until the consumer releases the slot. The [GPU PCM example](../../../examples/audio-fx/gpu-pcm-stream.ts) demonstrates both float formats and an explicit consumer-side stereo byte-packing path.

A consumer can unpack its byte readback into Float32 PCM and enqueue it before releasing the readback slot. Shader ABI, sample packing, sound graph, resampling and lookahead policy remain consumer responsibilities. GPU completion and MessagePort delivery are asynchronous; the queue and output clock expose information for an application policy, not an end-to-end latency guarantee.
