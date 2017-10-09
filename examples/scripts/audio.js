window.app = new Exo.Application({
    basePath: 'assets/',
    canvasParent: '.container-canvas',
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    load(loader) {
        loader.addItem('music', 'example', 'audio/example.ogg')
            .load()
            .then(() => this.app.trigger('scene:start'));
    },

    init() {
        const app = this.app,
            canvas = app.canvas,
            width = canvas.width,
            height = canvas.height;

        /**
         * @private
         * @member {Music}
         */
        this._music = app.loader.resources.get('music', 'example');

        /**
         * @private
         * @member {AudioAnalyser}
         */
        this._analyser = new Exo.AudioAnalyser(app.mediaManager);

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = document.createElement('canvas');
        this._canvas.style.position = 'absolute';
        this._canvas.style.top = '12.5%';
        this._canvas.style.left = 0;
        this._canvas.width = width;
        this._canvas.height = height * 0.75 | 0;

        /**
         * @private
         * @member {CanvasRenderingContext2D}
         */
        this._context = this._canvas.getContext('2d');
        this._context.strokeStyle = '#fff';
        this._context.lineWidth = 4;
        this._context.lineCap = 'round';
        this._context.lineJoin = 'round';

        /**
         * @private
         * @member {CanvasGradient}
         */
        this._gradient = this._context.createLinearGradient(0, 0, 0, this._canvas.height);
        this._gradient.addColorStop(0, '#f70');
        this._gradient.addColorStop(0.5, '#f30');
        this._gradient.addColorStop(1, '#f70');

        this._context.fillStyle = this._gradient;

        /**
         * @private
         * @member {Color}
         */
        this._color = new Exo.Color();

        /**
         * @private
         * @member {Time}
         */
        this._time = new Exo.Time();

        /**
         * @private
         * @member {Input}
         */
        this._input = new Exo.Input([
            Exo.KEYS.Space,
            Exo.GAMEPAD.FaceButtonBottom,
        ], {
            context: this,
            trigger() {
                this._music.toggle();
            },
        });

        canvas.parentNode.appendChild(this._canvas);

        app.trigger('input:add', this._input)
            .trigger('media:play', this._music, { loop: true });
    },

    update(delta) {
        if (this._music.paused) {
            return;
        }

        this._time.add(delta);

        const canvas = this._canvas,
            context = this._context,
            freqData = this._analyser.frequencyData,
            timeDomain = this._analyser.timeDomainData,
            seconds = this._time.seconds,
            width = canvas.width,
            height = canvas.height,
            length = freqData.length,
            barWidth = Math.ceil(width / length),
            redModifier = (Math.cos(seconds) * 0.5) + 0.5,
            greenModifier = (Math.sin(seconds) * 0.5) + 0.5;

        let [r, g, b] = [0, 0, 0];

        for (let i = 0; i < length; i++) {
            switch (i / (length / 3 | 0)) {
                case 0:
                    r += freqData[i] * redModifier;
                    break;
                case 1:
                    g += freqData[i] * greenModifier;
                    break;
                case 2:
                    b += freqData[i];
                    break;
            }
        }

        this.app.displayManager.clear(this._color.set(r / length, g / length, b / length));

        context.clearRect(0, 0, width, height);
        context.beginPath();

        for (let i = 0; i < length; i++) {
            const barHeight = height * freqData[i] / 255,
                lineHeight = height * timeDomain[i] / 255,
                offsetX = (i * barWidth) | 0;

            context.fillRect(offsetX, ((height / 2) - (barHeight / 2)) | 0, barWidth, barHeight | 0);
            context.lineTo(offsetX, ((height * 0.75) - (lineHeight / 2)) | 0);
        }

        context.stroke();
    },
}));
