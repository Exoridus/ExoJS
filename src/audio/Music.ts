import { clamp } from 'utils/math';
import { PlaybackOptions } from "const/types";
import { AbstractMedia } from "interfaces/AbstractMedia";
import { audioContext, isAudioContextReady, onAudioContextReady } from "const/audio-context";

export class Music extends AbstractMedia {
    private readonly _audioElement: HTMLMediaElement;
    private readonly _setupAudioContextHandler: (audioContext: AudioContext) => void = this.setupWithAudioContext.bind(this);
    private _gainNode: GainNode | null = null;
    private _sourceNode: MediaElementAudioSourceNode | null = null;

    constructor(audioElement: HTMLAudioElement, options?: Partial<PlaybackOptions>) {
        super(audioElement);

        this._audioElement = audioElement;
        this._setupAudioContextHandler = this.setupWithAudioContext.bind(this);

        if (options) {
            this.applyOptions(options);
        }

        if (isAudioContextReady()) {
            this._setupAudioContextHandler(audioContext!);
        } else {
            onAudioContextReady.once(this._setupAudioContextHandler);
        }
    }

    public setVolume(value: number): this {
        const volume = clamp(value, 0, 2);

        if (this._volume === volume) {
            return this;
        }

        if (this._gainNode) {
            this._gainNode.gain.setTargetAtTime(this.muted ? 0 : volume, this._audioContext!.currentTime, 10);
        }

        return this;
    }

    public setLoop(loop: boolean): this {
        if (this._loop !== loop) {
            this._loop = loop;
            this._audioElement.loop = loop;
        }

        return this;
    }

    public setSpeed(value: number): this {
        const speed = clamp(value, 0.1, 20);

        if (this._speed !== speed) {
            this._speed = speed;
            this._audioElement.playbackRate = speed;
        }

        return this;
    }

    public getTime(): number {
        return this._audioElement.currentTime;
    }

    public setTime(currentTime: number): this {
        this._audioElement.currentTime = Math.max(0, currentTime);

        return this;
    }

    public setMuted(muted: boolean): this {
        if (this._muted !== muted) {
            this._muted = muted;

            if (this._gainNode) {
                this._gainNode.gain.setTargetAtTime(muted ? 0 : this.volume, this._audioContext!.currentTime, 10);
            }
        }

        return this;
    }

    public get paused(): boolean {
        return this._audioElement.paused;
    }

    public set paused(paused: boolean) {
        if (paused) {
            this.pause();
        } else {
            this.play();
        }
    }

    public get analyserTarget(): AudioNode | null {
        return this._gainNode;
    }

    public play(options?: Partial<PlaybackOptions>): this {
        if (options) {
            this.applyOptions(options);
        }

        if (this.paused) {
            this._audioElement.play();
            this.onStart.dispatch();
        }

        return this;
    }

    public pause(options?: Partial<PlaybackOptions>): this {
        if (options) {
            this.applyOptions(options);
        }

        if (this.playing) {
            this._audioElement.pause();
            this.onStop.dispatch();
        }

        return this;
    }

    public destroy(): void {
        super.destroy();

        onAudioContextReady.remove(this.setupWithAudioContext, this);

        this._sourceNode?.disconnect();
        this._sourceNode = null;

        this._gainNode?.disconnect();
        this._gainNode = null;
    }

    private setupWithAudioContext(audioContext: AudioContext): void {
        this._audioContext = audioContext;

        this._gainNode = audioContext.createGain();
        this._gainNode.gain.setTargetAtTime(this.muted ? 0 : this.volume, audioContext.currentTime, 10);
        this._gainNode.connect(audioContext.destination);

        this._sourceNode = audioContext.createMediaElementSource(this._audioElement);
        this._sourceNode.connect(this._gainNode);
    }
}
