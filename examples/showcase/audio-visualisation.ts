import { audio } from '@assets';
import { Application, AudioAnalyser, Color, Music, Scene, Sprite, Texture, Time } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

class AudioVisualisationScene extends Scene {
    private _music!: Music;
    private _analyser!: AudioAnalyser;
    private _canvas!: HTMLCanvasElement;
    private _context!: CanvasRenderingContext2D;
    private _gradientStyle!: CanvasGradient;
    private _progressStyle = 'rgba(255, 255, 255, 0.1)';
    private _texture!: Texture;
    private _screen!: Sprite;
    private _time!: Time;
    private _values!: Float32Array;
    private _styles!: string[];

    override async load(loader): Promise<void> {
        await loader.load(Music, { example: audio.musicLoop });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this._music = loader.get(Music, 'example');

        this._analyser = new AudioAnalyser({ source: this._music });

        this._canvas = document.createElement('canvas');
        this._canvas.style.position = 'absolute';
        this._canvas.style.top = '12.5%';
        this._canvas.style.left = '0';
        this._canvas.width = width;
        this._canvas.height = height;

        this._context = this._canvas.getContext('2d')!;
        this._context.strokeStyle = '#fff';
        this._context.lineWidth = 4;
        this._context.lineCap = 'round';
        this._context.lineJoin = 'round';

        this._gradientStyle = this._context.createLinearGradient(0, 0, 0, this._canvas.height);
        this._gradientStyle.addColorStop(0, '#f70');
        this._gradientStyle.addColorStop(0.5, '#f30');
        this._gradientStyle.addColorStop(1, '#f70');

        this._texture = new Texture(this._canvas);

        this._screen = new Sprite(this._texture);

        this._time = new Time();

        this._values = new Float32Array(4);

        this._styles = ['rgba(255, 255, 255, 1)', 'rgba(0, 0, 255, 1)', 'rgba(0, 255, 0, 1)', 'rgba(255, 0, 0, 1)'];
        (window as any).__EXAMPLE_PREVIEW_AUTOPLAY__ = () => this._music.play({ loop: true, muted: false, volume: 0.5 });

        this.app.input.onPointerDown.add(() => {
            if (this._music.paused) {
                (window as any).__EXAMPLE_PREVIEW_AUTOPLAY__?.();
                return;
            }

            this._music.toggle();
        });
    }

    override update(delta): void {
        if (this._music.paused) {
            return;
        }

        this._time.addTime(delta);

        const freqData = this._analyser.getSpectrum();
        const len = freqData.length;

        let average = 0;
        let low = 0;
        let mid = 0;
        let high = 0;

        for (let i = 0; i < len; i++) {
            const val = freqData[i] / 255;
            const iSq = i * i;
            const i2Sq = i * 2 * (i * 2);
            const len2 = len * len;

            average += val;
            high += val * (iSq / len2);
            low += val * ((len2 - iSq) / len2);
            mid += val * (i < len / 2 ? i2Sq / len2 : (len2 - i2Sq) / len2);
        }

        this._values[0] = average / len;
        this._values[1] = low / len;
        this._values[2] = mid / len;
        this._values[3] = high / len;
    }

    override draw(context): void {
        if (this._music.paused) {
            return;
        }

        const canvas = this._canvas;
        const freqData = this._analyser.getSpectrum();
        const timeDomain = this._analyser.getWaveform();
        const width = canvas.width;
        const height = canvas.height;
        const length = freqData.length;
        const barWidth = Math.ceil(width / length);

        this._context.clearRect(0, 0, width, height);

        this._context.fillStyle = this._progressStyle;
        this._context.fillRect(0, 0, width * this._music.progress, height);

        this._context.fillStyle = this._gradientStyle;
        this._context.beginPath();

        for (let i = 0; i < length; i++) {
            const barHeight = (height * freqData[i]) / 255;
            const lineHeight = (height * timeDomain[i]) / 255;
            const offsetX = (i * barWidth) | 0;

            this._context.fillRect(offsetX, (height / 2 - barHeight / 2) | 0, barWidth, barHeight | 0);
            this._context.lineTo(offsetX, (height * 0.75 - lineHeight / 2) | 0);
        }

        for (let i = 0; i < 4; i++) {
            this._context.fillStyle = this._styles[i];
            this._context.fillRect(0, height - height * this._values[i], width, 2);
        }

        this._context.stroke();

        this._screen.updateTexture();

        context.backend.clear();
        context.render(this._screen);
    }
}

app.start(new AudioVisualisationScene());
