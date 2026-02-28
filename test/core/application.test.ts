import { Application, ApplicationStatus } from 'core/Application';

describe('Application', () => {
    test('update flushes renderer once per frame while running', () => {
        const app = Object.create(Application.prototype) as Application;
        const rawApp = app as any;
        const inputManager = { update: jest.fn() };
        const sceneManager = { update: jest.fn() };
        const renderManager = { display: jest.fn() };
        const frameClock = {
            elapsedTime: { milliseconds: 16 },
            restart: jest.fn(),
        };

        rawApp._status = ApplicationStatus.running;
        rawApp.inputManager = inputManager;
        rawApp.sceneManager = sceneManager;
        rawApp.renderManager = renderManager;
        rawApp._frameClock = frameClock;
        rawApp._updateHandler = jest.fn();
        rawApp._frameCount = 0;

        const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

        app.update();

        expect(inputManager.update).toHaveBeenCalledTimes(1);
        expect(sceneManager.update).toHaveBeenCalledTimes(1);
        expect(renderManager.display).toHaveBeenCalledTimes(1);
        expect(frameClock.restart).toHaveBeenCalledTimes(1);
        expect(rafSpy).toHaveBeenCalledTimes(1);

        rafSpy.mockRestore();
    });
});
