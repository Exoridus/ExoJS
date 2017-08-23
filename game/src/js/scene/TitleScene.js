import TitleMenuManager from '../menu/title/TitleMenuManager';

/**
 * @class TitleScene
 * @extends {Exo.Scene}
 */
export default class TitleScene extends Exo.Scene {

    /**
     * @override
     */
    init() {
        const resources = this.game.loader.resources;

        /**
         * @private
         * @member {TitleMenuManager}
         */
        this._menuManager = new TitleMenuManager(this.game);
        this._menuManager.enable('main');

        /**
         * @private
         * @member {Exo.Sprite}
         */
        this._titleBackground = resources.get('sprite', 'title/background');

        /**
         * @private
         * @member {Exo.Music}
         */
        this._titleMusic = resources.get('music', 'title/background');

        this.game.trigger('audio:play', this._titleMusic, {
            loop: true,
        });
    }

    /**
     * @override
     */
    update(delta) {
        this._menuManager.update(delta);

        this.game
            .trigger('display:begin')
            .trigger('display:render', this._titleBackground)
            .trigger('display:render', this._menuManager)
            .trigger('display:end');
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
