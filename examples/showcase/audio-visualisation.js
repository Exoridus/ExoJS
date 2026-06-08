// Auto-generated from audio-visualisation.ts — edit the .ts source, not this file.
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
    music;
    analyser;
    canvas;
    context;
    gradientStyle;
    progressStyle = 'rgba(255, 255, 255, 0.1)';
    texture;
    screen;
    time;
    values;
    styles;
    async load(loader) {
        await loader.load(Music, { example: assets.demo.audio.musicLoop });
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this.music = loader.get(Music, 'example');
        this.analyser = new AudioAnalyser({ source: this.music });
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '12.5%';
        this.canvas.style.left = '0';
        this.canvas.width = width;
        this.canvas.height = height;
        this.context = this.canvas.getContext('2d');
        this.context.strokeStyle = '#fff';
        this.context.lineWidth = 4;
        this.context.lineCap = 'round';
        this.context.lineJoin = 'round';
        this.gradientStyle = this.context.createLinearGradient(0, 0, 0, this.canvas.height);
        this.gradientStyle.addColorStop(0, '#f70');
        this.gradientStyle.addColorStop(0.5, '#f30');
        this.gradientStyle.addColorStop(1, '#f70');
        this.texture = new Texture(this.canvas);
        this.screen = new Sprite(this.texture);
        this.time = new Time();
        this.values = new Float32Array(4);
        this.styles = ['rgba(255, 255, 255, 1)', 'rgba(0, 0, 255, 1)', 'rgba(0, 255, 0, 1)', 'rgba(255, 0, 0, 1)'];
        window.__EXAMPLE_PREVIEW_AUTOPLAY__ = () => this.music.play({ loop: true, muted: false, volume: 0.5 });
        this.app.input.onPointerDown.add(() => {
            if (this.music.paused) {
                window.__EXAMPLE_PREVIEW_AUTOPLAY__?.();
                return;
            }
            this.music.toggle();
        });
    }
    update(delta) {
        if (this.music.paused) {
            return;
        }
        this.time.addTime(delta);
        const freqData = this.analyser.getSpectrum();
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
        this.values[0] = average / len;
        this.values[1] = low / len;
        this.values[2] = mid / len;
        this.values[3] = high / len;
    }
    draw(context) {
        if (this.music.paused) {
            return;
        }
        const canvas = this.canvas;
        const freqData = this.analyser.getSpectrum();
        const timeDomain = this.analyser.getWaveform();
        const width = canvas.width;
        const height = canvas.height;
        const length = freqData.length;
        const barWidth = Math.ceil(width / length);
        this.context.clearRect(0, 0, width, height);
        this.context.fillStyle = this.progressStyle;
        this.context.fillRect(0, 0, width * this.music.progress, height);
        this.context.fillStyle = this.gradientStyle;
        this.context.beginPath();
        for (let i = 0; i < length; i++) {
            const barHeight = (height * freqData[i]) / 255;
            const lineHeight = (height * timeDomain[i]) / 255;
            const offsetX = (i * barWidth) | 0;
            this.context.fillRect(offsetX, (height / 2 - barHeight / 2) | 0, barWidth, barHeight | 0);
            this.context.lineTo(offsetX, (height * 0.75 - lineHeight / 2) | 0);
        }
        for (let i = 0; i < 4; i++) {
            this.context.fillStyle = this.styles[i];
            this.context.fillRect(0, height - height * this.values[i], width, 2);
        }
        this.context.stroke();
        this.screen.updateTexture();
        context.backend.clear();
        context.render(this.screen);
    }
}
app.start(new AudioVisualisationScene());
