import { clamp } from '../utils/math';
import { GlobalAudioContext } from '../const/core';
import { PlaybackOptions } from "../const/types";
import { AbstractMedia } from "../AbstractMedia";

export default class Sound extends AbstractMedia {
    private readonly _audioBuffer: AudioBuffer;
    private readonly _gainNode: GainNode;
    private _paused: boolean = true;
    private _startTime: number = 0;
    private _currentTime: number = 0;
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

    public get analyserTarget(): AudioNode {
        return this._gainNode;
    }

    constructor(audioBuffer: AudioBuffer, options?: PlaybackOptions) {
        super({ duration: audioBuffer.duration });

        this._audioBuffer = audioBuffer;
        this._gainNode = GlobalAudioContext.createGain();
        this._gainNode.gain.setTargetAtTime(this.volume, GlobalAudioContext.currentTime, 10);
        this._gainNode.connect(GlobalAudioContext.destination);

        if (options) {
            this.applyOptions(options);
        }
    }

    public setVolume(value: number): this {
        const volume = clamp(value, 0, 2);

        if (this._volume !== volume) {
            this._volume = volume;
            this._gainNode.gain.setTargetAtTime(this.muted ? 0 : volume, GlobalAudioContext.currentTime, 10);
        }

        return this;
    }

    public setLoop(loop: boolean): this {
        if (this._loop !== loop) {
            this._loop = loop;

            if (this._sourceNode) {
                this._sourceNode.loop = loop;
            }
        }

        return this;
    }

    public setSpeed(value: number): this {
        const speed = clamp(value, 0.1, 20);

        if (this._speed !== speed) {
            this._speed = speed;

            if (this._sourceNode) {
                this._sourceNode.playbackRate.value = speed;
            }
        }

        return this;
    }

    public getTime(): number {
        if (!this._startTime || !GlobalAudioContext) {
            return 0;
        }

        return (this._currentTime + GlobalAudioContext.currentTime - this._startTime);
    }

    public setTime(currentTime: number): this {
        this.pause();
        this._currentTime = Math.max(0, currentTime);
        this.play();

        return this;
    }

    public setMuted(muted: boolean): this {
        if (this._muted !== muted) {
            this._muted = muted;
            this._gainNode.gain.setTargetAtTime(muted ? 0 : this.volume, GlobalAudioContext.currentTime, 10);
        }

        return this;
    }

    public play(options?: PlaybackOptions): this {
        if (options) {
            this.applyOptions(options);
        }

        if (this._paused) {
            this._sourceNode = GlobalAudioContext.createBufferSource();
            this._sourceNode.buffer = this._audioBuffer;
            this._sourceNode.loop = this.loop;
            this._sourceNode.playbackRate.value = this.speed;
            this._sourceNode.connect(this._gainNode);
            this._sourceNode.start(0, this._currentTime);
            this._startTime = GlobalAudioContext.currentTime;
            this._paused = false;
            this.onStart.dispatch();
        }

        return this;
    }

    public pause(options?: PlaybackOptions): this {
        if (options) {
            this.applyOptions(options);
        }

        if (!this._paused) {
            const duration = this.duration;
            const currentTime = this.currentTime;

            if (currentTime <= duration) {
                this._currentTime = currentTime;
            } else {
                this._currentTime = (currentTime - duration) * ((currentTime / duration) | 0);
            }

            this._sourceNode!.stop(0);
            this._sourceNode!.disconnect();
            this._sourceNode = null;
            this._paused = true;
            this.onStop.dispatch();
        }

        return this;
    }

    public destroy(): void {
        super.destroy();

        this._gainNode.disconnect();
        this._sourceNode?.disconnect();
    }
}
