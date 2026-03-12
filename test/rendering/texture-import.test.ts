describe('rendering/texture/Texture import behavior', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        jest.resetModules();
    });

    it('does not create canvases on import', () => {
        const createElementSpy = jest.spyOn(document, 'createElement');

        jest.isolateModules(() => {
            require('rendering/texture/Texture');
        });

        expect(createElementSpy).not.toHaveBeenCalled();
    });

    it('creates the cached black texture lazily on first access', () => {
        const createElementSpy = jest.spyOn(document, 'createElement');

        jest.isolateModules(() => {
            const { Texture } = require('rendering/texture/Texture');

            expect(createElementSpy).not.toHaveBeenCalled();

            void Texture.black;
        });

        expect(createElementSpy).toHaveBeenCalledWith('canvas');
    });
});
