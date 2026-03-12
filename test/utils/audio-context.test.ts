describe('utils/audio-context', () => {
    const originalAudioContext = globalThis.AudioContext;
    const originalOfflineAudioContext = globalThis.OfflineAudioContext;

    afterEach(() => {
        Object.defineProperty(globalThis, 'AudioContext', {
            configurable: true,
            value: originalAudioContext,
        });

        Object.defineProperty(globalThis, 'OfflineAudioContext', {
            configurable: true,
            value: originalOfflineAudioContext,
        });

        jest.restoreAllMocks();
        jest.resetModules();
    });

    it('does not create audio contexts or register interaction listeners on import', () => {
        let audioContextCreations = 0;
        let offlineAudioContextCreations = 0;

        class TestAudioContext {
            public state: AudioContextState = 'suspended';
            public currentTime = 0;
            public sampleRate = 44100;
            public destination = {};

            public constructor() {
                audioContextCreations++;
            }

            public resume(): Promise<void> {
                this.state = 'running';

                return Promise.resolve();
            }
        }

        class TestOfflineAudioContext {
            public constructor() {
                offlineAudioContextCreations++;
            }
        }

        Object.defineProperty(globalThis, 'AudioContext', {
            configurable: true,
            value: TestAudioContext,
        });

        Object.defineProperty(globalThis, 'OfflineAudioContext', {
            configurable: true,
            value: TestOfflineAudioContext,
        });

        const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

        jest.isolateModules(() => {
            require('utils/audio-context');
        });

        expect(audioContextCreations).toBe(0);
        expect(offlineAudioContextCreations).toBe(0);
        expect(addEventListenerSpy).not.toHaveBeenCalled();
    });

    it('creates the audio context lazily when a ready subscriber is added', () => {
        let audioContextCreations = 0;

        class TestAudioContext {
            public state: AudioContextState = 'suspended';
            public currentTime = 0;
            public sampleRate = 44100;
            public destination = {};

            public constructor() {
                audioContextCreations++;
            }

            public resume(): Promise<void> {
                this.state = 'running';

                return Promise.resolve();
            }
        }

        class TestOfflineAudioContext {}

        Object.defineProperty(globalThis, 'AudioContext', {
            configurable: true,
            value: TestAudioContext,
        });

        Object.defineProperty(globalThis, 'OfflineAudioContext', {
            configurable: true,
            value: TestOfflineAudioContext,
        });

        const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

        jest.isolateModules(() => {
            const { onAudioContextReady } = require('utils/audio-context');

            onAudioContextReady.once(() => undefined);
        });

        expect(audioContextCreations).toBe(1);
        expect(addEventListenerSpy).toHaveBeenCalled();
    });
});
