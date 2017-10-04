import TitleMenuManager from '../menu/title/TitleMenuManager';

/**
 * @class TitleScene
 * @extends {Scene}
 */
export default class TitleScene extends Exo.Scene {

    /**
     * @override
     */
    init() {
        const resources = this.app.loader.resources;

        /**
         * @private
         * @member {TitleMenuManager}
         */
        this._menuManager = new TitleMenuManager(this.app);
        this._menuManager.enable('main');

        /**
         * @private
         * @member {Sprite}
         */
        this._titleBackground = new Exo.Sprite(resources.get('texture', 'title/background'));

        /**
         * @private
         * @member {Music}
         */
        this._titleMusic = resources.get('music', 'title/background');

        this.app.trigger('media:play', this._titleMusic, { loop: true });

        this.addNode(this._titleBackground)
            .addNode(this._menuManager);
    }

    /**
     * @override
     */
    update(delta) {
        this._menuManager.update(delta);
    }

    /**
     * @override
     */
    unload() {
        this._menuManager.destroy();
        this._menuManager = null;

        this._titleBackground.destroy();
        this._titleBackground = null;

        this._titleMusic.destroy();
        this._titleMusic = null;
    }
}
