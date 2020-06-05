import { clamp } from 'utils/math';
import type { PlaybackOptions } from "types/types";
import { AbstractMedia } from "types/AbstractMedia";
import { getAudioContext, isAudioContextReady, onAudioContextReady } from "utils/audio-context";

export class Sound extends AbstractMedia {
    private readonly _audioBuffer: AudioBuffer;
    private _gainNode: GainNode | null = null;
    private _paused = true;
    private _startTime = 0;
    private _currentTime = 0;
    private _sourceNode: AudioBufferSourceNode | null = null;

    public get paused(): boolean {
        if (!this._paused || this._loop) {
            return false;
        }

        return (this.currentTime >= this.duration);
    }

    public set paused(paused: boolean) {
        if (paused) {
            this.pause();
        } else {
            this.play();
        }
    }

    public get analyserTarget(): GainNode | null {
        return this._gainNode;
    }

    public constructor(audioBuffer: AudioBuffer, options?: Partial<PlaybackOptions>) {
        super({
            duration: audioBuffer.duration,
            volume: 1,
            playbackRate: 1,
            loop: false,
            muted: false,
        });

        this._audioBuffer = audioBuffer;

        if (options) {
            this.applyOptions(options);
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

        if (this._gainNode) {
            this._gainNode.gain.setTargetAtTime(this.muted ? 0 : volume, this._audioContext!.currentTime, 10);
        }

        return this;
    }

    public setLoop(loop: boolean): this {
        this._loop = loop;

        if (this._sourceNode) {
            this._sourceNode.loop = loop;
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
        if (!this._startTime || !this._audioContext) {
            return 0;
        }

        return (this._currentTime + this._audioContext.currentTime - this._startTime);
    }

    public setTime(currentTime: number): this {
        const time = Math.max(0, currentTime);

        if (this.paused || !this._audioContext) {
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

        if (this._gainNode) {
            this._gainNode.gain.setTargetAtTime(muted ? 0 : this.volume, this._audioContext!.currentTime, 10);
        }

        return this;
    }

    public play(options?: Partial<PlaybackOptions>): this {
        if (options) {
            this.applyOptions(options);
        }

        if (!this._paused) {
            return this;
        }

        if (this._audioContext) {
            this.createSourceNode(this._audioContext);
        }

        this._paused = false;
        this.onStart.dispatch();

        return this;
    }

    public pause(options?: Partial<PlaybackOptions>): this {
        if (options) {
            this.applyOptions(options);
        }

        if (this._paused) {
            return this;
        }

        if (this._audioContext) {
            const duration = this.duration;
            const currentTime = this.currentTime;

            if (currentTime <= duration) {
                this._currentTime = currentTime;
            } else {
                this._currentTime = (currentTime - duration) * ((currentTime / duration) | 0);
            }

            if (this._sourceNode) {
                this._sourceNode.stop(0);
                this._sourceNode.disconnect();
                this._sourceNode = null;
            }
        }

        this._paused = true;
        this.onStop.dispatch();

        return this;
    }

    public destroy(): void {
        super.destroy();

        onAudioContextReady.clearByContext(this);

        this._gainNode?.disconnect();
        this._sourceNode?.disconnect();
    }

    private createSourceNode(audioContext: AudioContext): void {
        this._sourceNode = audioContext.createBufferSource();
        this._sourceNode.buffer = this._audioBuffer;
        this._sourceNode.loop = this.loop;
        this._sourceNode.playbackRate.value = this.playbackRate;
        this._sourceNode.connect(this._gainNode!);
        this._sourceNode.start(0, this._currentTime);
        this._startTime = audioContext.currentTime;
    }

    private setupWithAudioContext(audioContext: AudioContext): void {
        this._audioContext = audioContext;

        this._gainNode = audioContext.createGain();
        this._gainNode.gain.setTargetAtTime(this.muted ? 0 : this.volume, audioContext.currentTime, 10);
        this._gainNode.connect(audioContext.destination);

        if (!this._paused) {
            this.createSourceNode(this._audioContext);
        }
    }
}
