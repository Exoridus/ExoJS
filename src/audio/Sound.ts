import { clamp } from '@/math/utils';
import type { PlaybackOptions } from '@/core/types';
import { AbstractMedia } from '@/audio/AbstractMedia';
import { getAudioContext, isAudioContextReady, onAudioContextReady } from '@/audio/audio-context';

interface SoundAudioSetup {
    readonly audioContext: AudioContext;
    readonly gainNode: GainNode;
}

interface QueuedPooledPlay {
    readonly offset: number;
    readonly duration?: number;
    readonly loop: boolean;
    readonly loopStart?: number;
    readonly loopEnd?: number;
    readonly playbackRate: number;
}

interface NormalizedAudioSpriteClip {
    readonly start: number;
    readonly end: number;
    readonly loop: boolean;
}

export interface AudioSpriteClip {
    start: number;
    end: number;
    loop?: boolean;
}

export interface SoundOptions extends Partial<PlaybackOptions> {
    poolSize?: number;
    sprites?: Readonly<Record<string, AudioSpriteClip>>;
}

export class Sound extends AbstractMedia {
    private readonly _audioBuffer: AudioBuffer;
    private readonly _pooledSources: Array<AudioBufferSourceNode> = [];
    private readonly _queuedPooledPlays: Array<QueuedPooledPlay> = [];
    private readonly _sprites = new Map<string, NormalizedAudioSpriteClip>();

    private _audioSetup: SoundAudioSetup | null = null;
    private _paused = true;
    private _startTime = 0;
    private _currentTime = 0;
    private _sourceNode: AudioBufferSourceNode | null = null;
    private _poolSize = 1;

    public get paused(): boolean {
        return this._paused;
    }

    public set paused(paused: boolean) {
        if (paused) {
            this.pause();
        } else {
            this.play();
        }
    }

    public get analyserTarget(): GainNode | null {
        return this._audioSetup?.gainNode ?? null;
    }

    public get poolSize(): number {
        return this._poolSize;
    }

    public set poolSize(poolSize: number) {
        this.setPoolSize(poolSize);
    }

    public constructor(audioBuffer: AudioBuffer, options: SoundOptions = {}) {
        super({
            duration: audioBuffer.duration,
            volume: 1,
            playbackRate: 1,
            loop: false,
            muted: false,
        });

        this._audioBuffer = audioBuffer;

        const { poolSize, sprites, ...playbackOptions } = options;

        this._poolSize = Math.max(1, Math.floor(poolSize ?? 1));

        if (Object.keys(playbackOptions).length > 0) {
            this.applyOptions(playbackOptions);
        }

        if (sprites) {
            this.setSprites(sprites);
        }

        if (isAudioContextReady()) {
            this.setupWithAudioContext(getAudioContext());
        } else {
            onAudioContextReady.once(this.setupWithAudioContext, this);
        }
    }

    public setVolume(value: number): this {
        const volume = clamp(value, 0, 2);

        if (this._volume === volume) {
            return this;
        }

        this._volume = volume;

        if (this._audioSetup) {
            const { gainNode, audioContext } = this._audioSetup;
            gainNode.gain.setTargetAtTime(this.muted ? 0 : volume, audioContext.currentTime, 0.01);
        }

        return this;
    }

    public setLoop(loop: boolean): this {
        this._loop = loop;

        if (this._sourceNode) {
            this._sourceNode.loop = loop;

            if (loop) {
                this._sourceNode.loopStart = 0;
                this._sourceNode.loopEnd = this.duration;
            }
        }

        return this;
    }

    public setPlaybackRate(value: number): this {
        this._playbackRate = clamp(value, 0.1, 20);

        if (this._sourceNode) {
            this._sourceNode.playbackRate.value = this._playbackRate;
        }

        return this;
    }

    public getTime(): number {
        if (!this._audioSetup || this._paused || !this._sourceNode) {
            return this._currentTime;
        }

        return this._currentTime + ((this._audioSetup.audioContext.currentTime - this._startTime) * this._playbackRate);
    }

    public setTime(currentTime: number): this {
        const time = Math.max(0, currentTime);

        if (this.paused || !this._audioSetup) {
            this._currentTime = time;

            return this;
        }

        this.pause();
        this._currentTime = time;
        this.play();

        return this;
    }

    public setMuted(muted: boolean): this {
        this._muted = muted;

        if (this._audioSetup) {
            const { gainNode, audioContext } = this._audioSetup;
            gainNode.gain.setTargetAtTime(muted ? 0 : this.volume, audioContext.currentTime, 0.01);
        }

        return this;
    }

    public setPoolSize(poolSize: number): this {
        const normalizedPoolSize = Math.max(1, Math.floor(poolSize));

        if (this._poolSize === normalizedPoolSize) {
            return this;
        }

        this._poolSize = normalizedPoolSize;
        this._trimPooledSources();

        return this;
    }

    public setSprites(sprites: Readonly<Record<string, AudioSpriteClip>>): this {
        this._sprites.clear();

        for (const [name, clip] of Object.entries(sprites)) {
            this.defineSprite(name, clip);
        }

        return this;
    }

    public defineSprite(name: string, clip: AudioSpriteClip): this {
        if (name.trim().length === 0) {
            throw new Error('Sound sprite names must be non-empty strings.');
        }

        const start = clip.start;
        const end = clip.end;

        if (!Number.isFinite(start) || start < 0) {
            throw new Error(`Sound sprite "${name}" has an invalid start time (${start}).`);
        }

        if (!Number.isFinite(end) || end <= start) {
            throw new Error(`Sound sprite "${name}" has an invalid end time (${end}).`);
        }

        if (end > this.duration) {
            throw new Error(`Sound sprite "${name}" ends at ${end}s, which exceeds sound duration ${this.duration}s.`);
        }

        this._sprites.set(name, {
            start,
            end,
            loop: clip.loop ?? false,
        });

        return this;
    }

    public hasSprite(name: string): boolean {
        return this._sprites.has(name);
    }

    public removeSprite(name: string): this {
        this._sprites.delete(name);

        return this;
    }

    public play(options?: Partial<PlaybackOptions>): this {
        if (options) {
            this.applyOptions(options);
        }

        if (!this._paused) {
            return this;
        }

        if (this._audioSetup) {
            this.createSourceNode(this._audioSetup);
        }

        this._paused = false;
        this.onStart.dispatch();

        return this;
    }

    public playPooled(options: Partial<PlaybackOptions> = {}): this {
        const playbackRate = clamp(options.playbackRate ?? this._playbackRate, 0.1, 20);
        const offset = Math.max(0, options.time ?? 0);
        const loop = options.loop ?? false;

        if (options.volume !== undefined) {
            this.setVolume(options.volume);
        }

        if (options.muted !== undefined) {
            this.setMuted(options.muted);
        }

        if (offset >= this.duration) {
            return this;
        }

        const duration = loop ? undefined : (this.duration - offset);

        this._enqueuePooledPlay({
            offset,
            duration,
            loop,
            loopStart: 0,
            loopEnd: this.duration,
            playbackRate,
        });
        this.onStart.dispatch();

        return this;
    }

    public playSprite(name: string, options: Partial<PlaybackOptions> = {}): this {
        const clip = this._sprites.get(name);

        if (!clip) {
            throw new Error(`Sound sprite "${name}" is not defined.`);
        }

        const clipOffset = Math.max(0, options.time ?? 0);
        const offset = clip.start + clipOffset;

        if (offset >= clip.end) {
            throw new Error(
                `Sound sprite "${name}" offset (${clipOffset}s) exceeds clip duration (${clip.end - clip.start}s).`,
            );
        }

        const loop = options.loop ?? clip.loop;
        const playbackRate = clamp(options.playbackRate ?? this._playbackRate, 0.1, 20);

        if (options.volume !== undefined) {
            this.setVolume(options.volume);
        }

        if (options.muted !== undefined) {
            this.setMuted(options.muted);
        }

        this._enqueuePooledPlay({
            offset,
            duration: loop ? undefined : (clip.end - offset),
            loop,
            loopStart: clip.start,
            loopEnd: clip.end,
            playbackRate,
        });
        this.onStart.dispatch();

        return this;
    }

    public stopPooled(): this {
        if (this._pooledSources.length > 0) {
            this._stopPooledSources();
            this.onStop.dispatch();
        }

        this._queuedPooledPlays.length = 0;

        return this;
    }

    public pause(options?: Partial<PlaybackOptions>): this {
        if (options) {
            this.applyOptions(options);
        }

        if (this._paused && this._pooledSources.length === 0) {
            return this;
        }

        if (!this._paused && this._audioSetup) {
            const duration = this.duration;
            const currentTime = this.currentTime;

            this._currentTime = duration > 0 ? (currentTime % duration) : 0;
        }

        const hadPooledSources = this._pooledSources.length > 0;

        this._stopPrimarySource();
        this._stopPooledSources();
        this._queuedPooledPlays.length = 0;

        const wasPlaying = !this._paused || hadPooledSources;

        this._paused = true;

        if (wasPlaying) {
            this.onStop.dispatch();
        }

        return this;
    }

    public override destroy(): void {
        super.destroy();

        onAudioContextReady.clearByContext(this);

        this._audioSetup?.gainNode.disconnect();
        this._stopPrimarySource();
        this._stopPooledSources();

        this._queuedPooledPlays.length = 0;
        this._sprites.clear();
    }

    private createSourceNode(setup: SoundAudioSetup): void {
        const { audioContext } = setup;

        this._stopPrimarySource();

        const sourceNode = this._createBufferSourceNode(setup, {
            offset: Math.min(Math.max(0, this._currentTime), Math.max(0, this.duration)),
            duration: undefined,
            loop: this._loop,
            loopStart: 0,
            loopEnd: this.duration,
            playbackRate: this._playbackRate,
        });

        sourceNode.onended = (): void => {
            if (this._sourceNode !== sourceNode) {
                return;
            }

            this._sourceNode = null;
            this._startTime = 0;
            this._currentTime = 0;

            if (!this._paused) {
                this._paused = true;
                this.onStop.dispatch();
            }
        };

        this._sourceNode = sourceNode;
        this._startTime = audioContext.currentTime;
    }

    private setupWithAudioContext(audioContext: AudioContext): void {
        const gainNode = audioContext.createGain();
        gainNode.gain.setTargetAtTime(this.muted ? 0 : this.volume, audioContext.currentTime, 0.01);
        gainNode.connect(audioContext.destination);

        this._audioSetup = { audioContext, gainNode };

        if (!this._paused) {
            this.createSourceNode(this._audioSetup);
        }

        this._flushQueuedPooledPlays();
    }

    private _enqueuePooledPlay(play: QueuedPooledPlay): void {
        if (!this._audioSetup) {
            this._queuedPooledPlays.push(play);

            return;
        }

        this._playPooledNow(play);
    }

    private _flushQueuedPooledPlays(): void {
        if (!this._audioSetup || this._queuedPooledPlays.length === 0) {
            return;
        }

        const queued = [...this._queuedPooledPlays];

        this._queuedPooledPlays.length = 0;

        for (const play of queued) {
            this._playPooledNow(play);
        }
    }

    private _playPooledNow(play: QueuedPooledPlay): void {
        if (!this._audioSetup) {
            return;
        }

        const sourceNode = this._createBufferSourceNode(this._audioSetup, play);

        sourceNode.onended = (): void => {
            const index = this._pooledSources.indexOf(sourceNode);

            if (index !== -1) {
                this._pooledSources.splice(index, 1);
            }

            sourceNode.disconnect();
        };

        this._pooledSources.push(sourceNode);
        this._trimPooledSources();
    }

    private _trimPooledSources(): void {
        while (this._pooledSources.length > this._poolSize) {
            const oldestSource = this._pooledSources.shift();

            if (!oldestSource) {
                continue;
            }

            oldestSource.onended = null;
            this._stopSourceNode(oldestSource);
        }
    }

    private _stopPrimarySource(): void {
        if (!this._sourceNode) {
            return;
        }

        this._sourceNode.onended = null;
        this._stopSourceNode(this._sourceNode);

        this._sourceNode = null;
        this._startTime = 0;
    }

    private _stopPooledSources(): void {
        for (const sourceNode of this._pooledSources) {
            sourceNode.onended = null;
            this._stopSourceNode(sourceNode);
        }

        this._pooledSources.length = 0;
    }

    private _stopSourceNode(sourceNode: AudioBufferSourceNode): void {
        try {
            sourceNode.stop(0);
        } catch {
            // source nodes can only be stopped once; ignore invalid state errors
        }

        sourceNode.disconnect();
    }

    private _createBufferSourceNode(setup: SoundAudioSetup, play: QueuedPooledPlay): AudioBufferSourceNode {
        const { gainNode } = setup;
        const sourceNode = setup.audioContext.createBufferSource();

        sourceNode.buffer = this._audioBuffer;
        sourceNode.loop = play.loop;
        sourceNode.playbackRate.value = play.playbackRate;

        if (play.loop) {
            sourceNode.loopStart = play.loopStart ?? 0;
            sourceNode.loopEnd = play.loopEnd ?? this.duration;
        }

        sourceNode.connect(gainNode);

        const duration = play.duration;

        if (!play.loop && duration !== undefined && duration > 0) {
            sourceNode.start(0, play.offset, duration);
        } else {
            sourceNode.start(0, play.offset);
        }

        return sourceNode;
    }
}
