import MenuManager from '../MenuManager';
import MainMenu from './MainMenu';
import NewGameMenu from './NewGameMenu';
import LoadGameMenu from './LoadGameMenu';
import SettingsMenu from './SettingsMenu';

/**
 * @class TitleMenuManager
 * @extends {MenuManager}
 */
export default class TitleMenuManager extends MenuManager {

    /**
     * @constructor
     * @param {Exo.Game} game
     */
    constructor(game) {
        super(game);

        this.addMenu('main', new MainMenu(game));
        this.addMenu('newGame', new NewGameMenu(game, 'main'));
        this.addMenu('loadGame', new LoadGameMenu(game, 'main'));
        this.addMenu('settings', new SettingsMenu(game, 'main'));

        this.openMenu('main');
    }
}
