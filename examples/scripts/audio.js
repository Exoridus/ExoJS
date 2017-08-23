export default class ExampleScene extends Exo.Scene({

    /**
     * @override
     */
    load(loader) {
        loader.add('music', 'example', 'audio/example.ogg')
            .load()
            .then(() => this.game.trigger('scene:start'));
    },

    /**
     * @override
     */
    init() {
        const game = this.game;

        /**
         * @private
         * @member {Exo.Music}
         */
        this._music = game.loader.resources.get('music', 'example');

        /**
         * @private
         * @member {Exo.AudioAnalyser}
         */
        this._analyser = new Exo.AudioAnalyser(game.audioManager);

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = document.createElement('canvas');

        /**
         * @private
         * @member {CanvasRenderingContext2D}
         */
        this._context = this._canvas.getContext('2d');

        /**
         * @private
         * @member {Exo.Color}
         */
        this._color = new Exo.Color();

        /**
         * @private
         * @member {Exo.Time}
         */
        this._time = new Exo.Time();

        /**
         * @private
         * @member {Exo.Input}
         */
        this._input = new Exo.Input([
            Exo.Keyboard.Space,
        ], {
            trigger() {
                this._music.toggle();
            }
        });

        window.addEventListener('resize', this._updateCanvas.bind(this));

        this._updateCanvas();

        game.trigger('input:add', this._input)
            .trigger('audio:play', this._music, {
                loop: true,
            });
    },

    /**
     * @override
     */
    update(delta) {
        if (this._music.paused) {
            return;
        }

        const canvas = this._canvas,
            context = this._context,
            freqData = this._analyser.getFrequencyData(),
            timeDomain = this._analyser.getTimeDomainData(),
            time = this._time.add(delta)
                .asSeconds(),
            width = canvas.width,
            height = canvas.height,
            length = freqData.length,
            barWidth = Math.ceil(width / length),
            redModifier = (Math.cos(time) * 0.5) + 0.5,
            greenModifier = (Math.sin(time) * 0.5) + 0.5;

        let [r, g, b] = [0, 0, 0];

        for (let i = 0; i < length; i++) {
            switch (i / (length / 3) | 0) {
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

        this.game.trigger('display:clear', this._color.set(r / length, g / length, b / length));
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

    /**
     * @override
     */
    unload() {

    },

    /**
     * @private
     */
    _updateCanvas() {
        const canvas = this._canvas,
            context = this._context,
            width = window.innerWidth,
            height = window.innerHeight,
            effectHeight = height * 0.75 | 0,
            gradient = context.createLinearGradient(0, 0, 0, effectHeight);

        gradient.addColorStop(0, '#f70');
        gradient.addColorStop(0.5, '#f30');
        gradient.addColorStop(1, '#f70');

        this.game.trigger('display:resize', width, height);

        canvas.width = width;
        canvas.height = effectHeight;

        context.fillStyle = gradient;
        context.strokeStyle = '#fff';
        context.lineWidth = 4;
        context.lineCap = 'round';
        context.lineJoin = 'round';
    },
});
