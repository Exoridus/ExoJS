import { getAudioContext, isAudioContextReady, onAudioContextReady } from '@/audio/audio-context';
import type { AudioBus } from '@/audio/AudioBus';
import type { Sound } from '@/audio/Sound';
import type { Music } from '@/audio/Music';

export type AudioAnalyserSource = AudioBus | Sound | Music | MediaStream | AudioNode | null;

export interface AudioAnalyserOptions {
    fftSize?: number;
    smoothingTimeConstant?: number;
    minDecibels?: number;
    maxDecibels?: number;
}

type RequiredAnalyserOptions = Required<AudioAnalyserOptions>;

/**
 * Lightweight visualisation analyser backed by a Web Audio AnalyserNode.
 *
 * Accepts any of: AudioBus, Sound, Music, MediaStream, AudioNode, or null.
 * The tap is a parallel branch — it does not affect the source's main routing.
 *
 * Migration from 0.7.1: the old constructor was `new AudioAnalyser(media, options)`.
 * The new API is `new AudioAnalyser(options?); analyser.source = media`.
 */
export class AudioAnalyser {
    private _analyser: AnalyserNode | null = null;
    private readonly _options: RequiredAnalyserOptions;
    private _source: AudioAnalyserSource = null;
    private _tapSource: AudioNode | null = null;
    private _streamSource: MediaStreamAudioSourceNode | null = null;

    // Pre-allocated buffers
    private _byteSpectrum: Uint8Array<ArrayBuffer>;
    private _floatSpectrum: Float32Array<ArrayBuffer>;
    private _byteWaveform: Uint8Array<ArrayBuffer>;
    private _floatWaveform: Float32Array<ArrayBuffer>;

    public constructor(options?: AudioAnalyserOptions) {
        this._options = {
            fftSize: options?.fftSize ?? 2048,
            smoothingTimeConstant: options?.smoothingTimeConstant ?? 0.8,
            minDecibels: options?.minDecibels ?? -100,
            maxDecibels: options?.maxDecibels ?? -30,
        };

        const binCount = this._options.fftSize >> 1;
        this._byteSpectrum   = new Uint8Array(binCount) as Uint8Array<ArrayBuffer>;
        this._floatSpectrum  = new Float32Array(binCount) as Float32Array<ArrayBuffer>;
        this._byteWaveform   = new Uint8Array(binCount) as Uint8Array<ArrayBuffer>;
        this._floatWaveform  = new Float32Array(binCount) as Float32Array<ArrayBuffer>;

        if (isAudioContextReady()) {
            this._setupAnalyser(getAudioContext());
        } else {
            onAudioContextReady.once(this._setupAnalyser, this);
        }
    }

    // -----------------------------------------------------------------------
    // Source setter
    // -----------------------------------------------------------------------

    public get source(): AudioAnalyserSource {
        return this._source;
    }

    public set source(value: AudioAnalyserSource) {
        if (value === this._source) return;

        // 1. Disconnect current tap
        this._disconnectTap();

        this._source = value;

        if (value === null) return;

        // 2. Resolve and connect new tap
        if (isAudioContextReady()) {
            this._connectSource(value, getAudioContext());
        } else {
            onAudioContextReady.once((ctx: AudioContext) => {
                if (this._source === value) {
                    this._connectSource(value, ctx);
                }
            }, this);
        }
    }

    // -----------------------------------------------------------------------
    // AnalyserNode property pass-throughs
    // -----------------------------------------------------------------------

    public get fftSize(): number {
        return this._options.fftSize;
    }

    public get frequencyBinCount(): number {
        return this._options.fftSize >> 1;
    }

    public get smoothingTimeConstant(): number {
        return this._analyser?.smoothingTimeConstant ?? this._options.smoothingTimeConstant;
    }

    public set smoothingTimeConstant(v: number) {
        this._options.smoothingTimeConstant = v;
        if (this._analyser) this._analyser.smoothingTimeConstant = v;
    }

    public get minDecibels(): number {
        return this._analyser?.minDecibels ?? this._options.minDecibels;
    }

    public set minDecibels(v: number) {
        this._options.minDecibels = v;
        if (this._analyser) this._analyser.minDecibels = v;
    }

    public get maxDecibels(): number {
        return this._analyser?.maxDecibels ?? this._options.maxDecibels;
    }

    public set maxDecibels(v: number) {
        this._options.maxDecibels = v;
        if (this._analyser) this._analyser.maxDecibels = v;
    }

    // -----------------------------------------------------------------------
    // Raw data
    // -----------------------------------------------------------------------

    /** Fill and return the byte frequency spectrum (0..255 per bin). */
    public getSpectrum(into?: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
        const buf = into ?? this._byteSpectrum;
        if (this._analyser) {
            this._analyser.getByteFrequencyData(buf);
        } else {
            buf.fill(0);
        }
        return buf;
    }

    /** Fill and return the float frequency spectrum (dB per bin). */
    public getSpectrumFloat(into?: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
        const buf = into ?? this._floatSpectrum;
        if (this._analyser) {
            this._analyser.getFloatFrequencyData(buf);
        } else {
            buf.fill(0);
        }
        return buf;
    }

    /** Fill and return the byte time-domain waveform (0..255 per sample). */
    public getWaveform(into?: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
        const buf = into ?? this._byteWaveform;
        if (this._analyser) {
            this._analyser.getByteTimeDomainData(buf);
        } else {
            buf.fill(0);
        }
        return buf;
    }

    /** Fill and return the float time-domain waveform (-1..1 per sample). */
    public getWaveformFloat(into?: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
        const buf = into ?? this._floatWaveform;
        if (this._analyser) {
            this._analyser.getFloatTimeDomainData(buf);
        } else {
            buf.fill(0);
        }
        return buf;
    }

    // -----------------------------------------------------------------------
    // Convenience helpers
    // -----------------------------------------------------------------------

    /**
     * Return the mean energy of frequency bins in the given Hz range, normalised 0..1.
     * Uses the byte spectrum (0..255), normalised by dividing by 255.
     */
    public getBandEnergy(fromHz: number, toHz: number): number {
        if (!this._analyser) return 0;
        const ctx = getAudioContext();
        const nyquist = ctx.sampleRate / 2;
        const binCount = this.frequencyBinCount;
        const fromBin = Math.max(0, Math.min(binCount - 1, Math.round(fromHz / nyquist * binCount)));
        const toBin   = Math.max(0, Math.min(binCount - 1, Math.round(toHz   / nyquist * binCount)));

        const lo = Math.min(fromBin, toBin);
        const hi = Math.max(fromBin, toBin);

        const spectrum = this.getSpectrum();
        let sum = 0;
        const count = hi - lo + 1;
        for (let i = lo; i <= hi; i++) {
            sum += spectrum[i];
        }
        return sum / (count * 255);
    }

    /** Return low (0-250 Hz), mid (250-2 kHz), and high (2 k-20 kHz) band energies (0..1 each). */
    public getLowMidHigh(): { low: number; mid: number; high: number } {
        return {
            low:  this.getBandEnergy(0,     250),
            mid:  this.getBandEnergy(250,   2000),
            high: this.getBandEnergy(2000,  20000),
        };
    }

    /** Return overall RMS energy across all bins, normalised 0..1. */
    public getRms(): number {
        if (!this._analyser) return 0;
        const ctx = getAudioContext();
        const nyquist = ctx.sampleRate / 2;
        return this.getBandEnergy(0, nyquist);
    }

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    public destroy(): void {
        onAudioContextReady.clearByContext(this);
        this._disconnectTap();
        this._analyser?.disconnect();
        this._analyser = null;
        this._source = null;
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private _setupAnalyser(audioContext: AudioContext): void {
        const node = audioContext.createAnalyser();
        node.fftSize = this._options.fftSize;
        node.minDecibels = this._options.minDecibels;
        node.maxDecibels = this._options.maxDecibels;
        node.smoothingTimeConstant = this._options.smoothingTimeConstant;
        this._analyser = node;

        // If a source was set before the context was ready, connect it now.
        if (this._source !== null) {
            this._connectSource(this._source, audioContext);
        }
    }

    private _connectSource(source: AudioAnalyserSource, audioContext: AudioContext): void {
        if (!this._analyser) return;

        const tap = this._resolveToAudioNode(source, audioContext);
        if (!tap) {
            // AudioBus/Sound/Music not ready — defer via their own onceSetup
            this._deferConnectionViaBus(source);
            return;
        }

        this._tapSource = tap;
        tap.connect(this._analyser);
    }

    private _resolveToAudioNode(
        source: AudioAnalyserSource,
        audioContext: AudioContext,
    ): AudioNode | null {
        if (source === null) return null;

        // MediaStream — detect by getTracks (duck-type, since AudioNode also doesn't exist in jsdom)
        const asStream = source as Partial<{ getTracks: unknown }>;
        if (typeof asStream.getTracks === 'function') {
            if (this._streamSource) {
                this._streamSource.disconnect();
                this._streamSource = null;
            }
            const msNode = audioContext.createMediaStreamSource(source as MediaStream);
            this._streamSource = msNode;
            return msNode;
        }

        // AudioBus — has _getOutputNode (checked first since bus nodes also have connect/disconnect)
        const asBus = source as Partial<{ _getOutputNode: () => AudioNode | null }>;
        if (typeof asBus._getOutputNode === 'function') {
            return asBus._getOutputNode();
        }

        // Sound / Music — tap analyserTarget
        const asMedia = source as Partial<{ analyserTarget: AudioNode | null }>;
        if ('analyserTarget' in asMedia) {
            return asMedia.analyserTarget ?? null;
        }

        // Raw AudioNode — duck-type: has connect & disconnect
        const asNode = source as Partial<{ connect: unknown; disconnect: unknown }>;
        if (typeof asNode.connect === 'function' && typeof asNode.disconnect === 'function') {
            return source as unknown as AudioNode;
        }

        return null;
    }

    private _deferConnectionViaBus(source: AudioAnalyserSource): void {
        // AudioBus exposes onceSetup
        const asBus = source as Partial<{ onceSetup: (cb: () => void) => void }>;
        if (typeof asBus.onceSetup === 'function') {
            asBus.onceSetup(() => {
                if (this._source === source && this._analyser && isAudioContextReady()) {
                    this._connectSource(source, getAudioContext());
                }
            });
            return;
        }

        // Sound/Music — they set up when audioContext is ready (same signal)
        onAudioContextReady.once(() => {
            if (this._source === source && this._analyser && isAudioContextReady()) {
                this._connectSource(source, getAudioContext());
            }
        }, this);
    }

    private _disconnectTap(): void {
        if (this._tapSource && this._analyser) {
            try {
                this._tapSource.disconnect(this._analyser);
            } catch {
                // Ignore if already disconnected
            }
        }
        this._tapSource = null;

        // Clean up cached stream source
        if (this._streamSource) {
            this._streamSource.disconnect();
            this._streamSource = null;
        }
    }
}
