describe('@/core/Application import behavior', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        jest.resetModules();
    });

    it('does not create a canvas on import', () => {
        const createElementSpy = jest.spyOn(document, 'createElement');

        jest.isolateModules(() => {
            require('@/core/Application');
        });

        expect(createElementSpy).not.toHaveBeenCalled();
    });
});
