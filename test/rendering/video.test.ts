import { Video } from '@/rendering/video/Video';

interface MockVideoElement {
    readonly element: HTMLVideoElement;
    setDimensions(width: number, height: number): void;
}

const createMockVideoElement = (): MockVideoElement => {
    const element = document.createElement('video');
    let videoWidth = 0;
    let videoHeight = 0;

    Object.defineProperty(element, 'videoWidth', {
        configurable: true,
        get: () => videoWidth,
    });
    Object.defineProperty(element, 'videoHeight', {
        configurable: true,
        get: () => videoHeight,
    });
    Object.defineProperty(element, 'duration', {
        configurable: true,
        value: 10,
    });
    Object.defineProperty(element, 'volume', {
        configurable: true,
        writable: true,
        value: 1,
    });
    Object.defineProperty(element, 'playbackRate', {
        configurable: true,
        writable: true,
        value: 1,
    });
    Object.defineProperty(element, 'loop', {
        configurable: true,
        writable: true,
        value: false,
    });
    Object.defineProperty(element, 'muted', {
        configurable: true,
        writable: true,
        value: false,
    });

    return {
        element,
        setDimensions: (width: number, height: number): void => {
            videoWidth = width;
            videoHeight = height;
        },
    };
};

describe('Video', () => {
    test('updates texture frame when metadata arrives even before render()', () => {
        const mockVideo = createMockVideoElement();
        const video = new Video(mockVideo.element);

        expect(video.textureFrame.width).toBe(0);
        expect(video.textureFrame.height).toBe(0);

        mockVideo.setDimensions(320, 180);
        mockVideo.element.dispatchEvent(new Event('loadedmetadata'));

        expect(video.textureFrame.width).toBe(320);
        expect(video.textureFrame.height).toBe(180);

        video.destroy();
    });

    test('keeps explicit display size while syncing intrinsic frame size on metadata resize', () => {
        const mockVideo = createMockVideoElement();
        const video = new Video(mockVideo.element);

        mockVideo.setDimensions(640, 360);
        mockVideo.element.dispatchEvent(new Event('loadedmetadata'));

        video.width = 256;
        video.height = 144;

        mockVideo.setDimensions(1280, 720);
        mockVideo.element.dispatchEvent(new Event('resize'));

        expect(video.width).toBe(256);
        expect(video.height).toBe(144);
        expect(video.textureFrame.width).toBe(1280);
        expect(video.textureFrame.height).toBe(720);

        video.destroy();
    });
});
