const app = new Exo.Application({
    resourcePath: 'assets/',
    clearColor: Exo.Color.Black,
    canvasParent: document.body,
    width: 800,
    height: 600,
});

app.start(new Exo.Scene({

    /**
     * @param {Loader} loader
     */
    load(loader) {
        loader.add('music', { example: 'audio/example.ogg' });
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const canvas = this.app.canvas;

        /**
         * @private
         * @member {Music}
         */
        this._music = resources.get('music', 'example');

        /**
         * @private
         * @member {AudioAnalyser}
         */
        this._analyser = new Exo.AudioAnalyser(this._music);

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = document.createElement('canvas');
        this._canvas.style.position = 'absolute';
        this._canvas.style.top = '12.5%';
        this._canvas.style.left = 0;
        this._canvas.width = canvas.width;
        this._canvas.height = canvas.height;

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

        /**
         * @private
         * @member {String}
         */
        this._progress = 'rgba(255, 255, 255, 0.1)';

        /**
         * @private
         * @member {Texture}
         */
        this._texture = new Exo.Texture(this._canvas);

        /**
         * @private
         * @member {Sprite}
         */
        this._screen = new Exo.Sprite(this._texture);

        /**
         * @private
         * @member {Color}
         */
        this._clearColor = new Exo.Color();

        /**
         * @private
         * @member {Time}
         */
        this._time = new Exo.Time();

        this._music.play({
            loop: true,
            volume: 0.5
        });

        this.app.inputManager.onPointerDown.add(() => {
            this._music.toggle();
        });
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        if (this._music.paused) {
            return;
        }

        const freqData = this._analyser.frequencyData,
            seconds = this._time.add(delta).seconds,
            length = freqData.length,
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

        this._clearColor.set(r / length, g / length, b / length);
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        if (this._music.paused) {
            return;
        }

        const canvas = this._canvas,
            freqData = this._analyser.frequencyData,
            timeDomain = this._analyser.timeDomainData,
            width = canvas.width,
            height = canvas.height,
            length = freqData.length,
            barWidth = Math.ceil(width / length);

        this._context.clearRect(0, 0, width, height);

        this._context.fillStyle = this._progress;
        this._context.fillRect(0, 0, (width * this._music.progress), height);

        this._context.fillStyle = this._gradient;
        this._context.beginPath();

        for (let i = 0; i < length; i++) {
            const barHeight = height * freqData[i] / 255,
                lineHeight = height * timeDomain[i] / 255,
                offsetX = (i * barWidth) | 0;

            this._context.fillRect(offsetX, ((height / 2) - (barHeight / 2)) | 0, barWidth, barHeight | 0);
            this._context.lineTo(offsetX, ((height * 0.75) - (lineHeight / 2)) | 0);
        }

        this._context.stroke();

        this._screen.updateTexture();

        renderManager
            .clear(this._clearColor)
            .draw(this._screen)
            .display();
    },
}));
