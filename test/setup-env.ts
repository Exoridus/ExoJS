const mockContext2d = {
    fillStyle: '',
    fillRect: () => undefined,
    drawImage: () => undefined,
};

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => mockContext2d,
});

class MockAudioContext {
    public state: AudioContextState = 'running';
    public currentTime = 0;
    public sampleRate = 44100;
    public destination = {};

    public resume(): Promise<void> {
        this.state = 'running';

        return Promise.resolve();
    }

    public createAnalyser(): AnalyserNode {
        return {
            connect: () => undefined,
            disconnect: () => undefined,
            fftSize: 2048,
            minDecibels: -100,
            maxDecibels: -30,
            smoothingTimeConstant: 0.8,
            getByteTimeDomainData: () => undefined,
            getByteFrequencyData: () => undefined,
            getFloatTimeDomainData: () => undefined,
            getFloatFrequencyData: () => undefined,
        } as unknown as AnalyserNode;
    }

    public createGain(): GainNode {
        return {
            connect: () => undefined,
            disconnect: () => undefined,
            gain: {
                setTargetAtTime: () => undefined,
                value: 1,
            },
        } as unknown as GainNode;
    }

    public createMediaElementSource(): MediaElementAudioSourceNode {
        return {
            connect: () => undefined,
            disconnect: () => undefined,
        } as unknown as MediaElementAudioSourceNode;
    }

    public createBufferSource(): AudioBufferSourceNode {
        return {
            connect: () => undefined,
            disconnect: () => undefined,
            start: () => undefined,
            stop: () => undefined,
            playbackRate: { value: 1 },
            loop: false,
            buffer: null,
        } as unknown as AudioBufferSourceNode;
    }
}

class MockOfflineAudioContext {
    public sampleRate: number;

    public constructor(_channels: number, _length: number, sampleRate: number) {
        this.sampleRate = sampleRate;
    }

    public decodeAudioData(): Promise<AudioBuffer> {
        return Promise.resolve({} as AudioBuffer);
    }
}

Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: MockAudioContext,
});

Object.defineProperty(globalThis, 'OfflineAudioContext', {
    configurable: true,
    value: MockOfflineAudioContext,
});
