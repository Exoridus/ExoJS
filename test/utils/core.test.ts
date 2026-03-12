describe('utils/core', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        jest.resetModules();
    });

    it('does not touch the DOM while importing the module', () => {
        const createElementSpy = jest.spyOn(document, 'createElement');
        const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

        jest.isolateModules(() => {
            require('utils/core');
        });

        expect(createElementSpy).not.toHaveBeenCalled();
        expect(addEventListenerSpy).not.toHaveBeenCalled();
    });

    it('creates the audio element lazily when codec support is checked', () => {
        const createElementSpy = jest.spyOn(document, 'createElement');

        jest.isolateModules(() => {
            const { supportsCodec } = require('utils/core');

            supportsCodec('audio/mpeg');
        });

        expect(createElementSpy).toHaveBeenCalledWith('audio');
    });

    it('probes passive event support lazily', () => {
        const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

        jest.isolateModules(() => {
            const { supportsEventOptions } = require('utils/core');

            expect(addEventListenerSpy).not.toHaveBeenCalled();
            expect(supportsEventOptions()).toBe(true);
        });

        expect(addEventListenerSpy).toHaveBeenCalled();
    });
});
