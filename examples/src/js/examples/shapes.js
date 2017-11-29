window.app = new Exo.Application({
    assetsPath: 'assets/',
    canvasParent: '.container-canvas',
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const canvas = this.app.canvas;

        /**
         * @type {Shape}
         */
        this._shape = new Exo.Shape();
        this._shape.beginFill(0xFF3300);
        this._shape.lineStyle(4, 0xffd900, 1);

        this._shape.moveTo(50,50);
        this._shape.lineTo(250, 50);
        this._shape.lineTo(100, 100);
        this._shape.lineTo(50, 50);
        this._shape.endFill();

        this._shape.lineStyle(2, 0x0000FF, 1);
        this._shape.beginFill(0xFF700B, 1);
        this._shape.drawRect(50, 250, 120, 120);

        this._shape.lineStyle(2, 0xFF00FF, 1);
        this._shape.beginFill(0xFF00BB, 0.25);
        this._shape.drawRoundedRect(150, 450, 300, 100, 15);
        this._shape.endFill();

        this._shape.lineStyle(0);
        this._shape.beginFill(0xFFFF0B, 0.5);
        this._shape.drawCircle(470, 90,60);
        this._shape.endFill();
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        this.app.renderManager
            .clear()
            .draw(this._shape)
            .display();
    },

    /**
     * @override
     */
    destroy() {
        this._shape.destroy();
        this._shape = null;
    },
}));
