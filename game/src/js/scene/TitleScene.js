import TitleMenuManager from '../menu/title/TitleMenuManager';

/**
 * @class TitleScene
 * @extends {Scene}
 */
export default class TitleScene extends Exo.Scene {

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const mediaManager = this.app.mediaManager;

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

        mediaManager.play(this._titleMusic, { loop: true });
    }

    /**
     * @override
     */
    update(delta) {
        const displayManager = this.app.displayManager;

        this._menuManager.update(delta);

        displayManager.begin();
        displayManager.render(this._titleBackground);
        displayManager.render(this._menuManager);
        displayManager.end();
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
