const app = new Exo.Application({
    resourcePath: 'assets/image/icons/',
    canvasParent: document.body,
    width: 800,
    height: 600,
});

app.start(new Exo.Scene({

    /**
     * @param {Loader} loader
     */
    load(loader) {
        loader.add('texture', {
            faceBottom: 'buttonA.png',
            faceRight: 'buttonB.png',
            faceLeft: 'buttonX.png',
            faceTop: 'buttonY.png',
            shoulderLeftBottom: 'buttonL1.png',
            shoulderRightBottom: 'buttonR1.png',
            shoulderLeftTop: 'buttonL2.png',
            shoulderRightTop: 'buttonR2.png',
            select: 'buttonSelect.png',
            start: 'buttonStart.png',
            leftStick: 'joystickL_top.png',
            rightStick: 'joystickR_top.png',
            DPadField: 'DPAD_all.png',
            home: 'home.png',
            gamepad: 'gamepad.png',
        });
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const gamepad = this.app.inputManager.gamepads[0];

        /**
         * @private
         * @member {Color}
         */
        this._buttonColor = new Exo.Color(255, 255, 255, 0.25);

        /**
         * @private
         * @member {Color}
         */
        this._connectedColor = new Exo.Color(0, 255, 0, 0.65);

        /**
         * @private
         * @member {Color}
         */
        this._disconnectedColor = new Exo.Color(255, 0, 0, 0.65);

        /**
         * @private
         * @member {Map<Number, Sprite>}
         */
        this._mappingButtons = new Map();

        /**
         * @private
         * @member {Map<Number, Function>}
         */
        this._mappingFunctions = new Map();

        /**
         * @private
         * @member {Sprite}
         */
        this._status = this.createStatus(resources);

        /**
         * @private
         * @member {Container}
         */
        this._container = this.createGamepad(resources);

        for (const sprite of this._mappingButtons.values()) {
            sprite.setTint(this._buttonColor);
        }

        gamepad.on('connect', (channel, value) => this._status.setTint(this._connectedColor));
        gamepad.on('disconnect', (channel, value) => this._status.setTint(this._disconnectedColor));
        gamepad.on('update', (channel, value) => {
            if (this._mappingButtons.has(channel)) {
                this._mappingButtons.get(channel).tint.a = Exo.lerp(0.25, 1, value);
            }

            if (this._mappingFunctions.has(channel)) {
                this._mappingFunctions.get(channel)(value);
            }
        });
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager.clear()
            .draw(this._status)
            .draw(this._container)
            .display();
    },

    /**
     * @private
     * @param {ResourceContainer} resources
     * @returns {Container}
     */
    createStatus(resources) {
        const { width, height } = this.app.canvas,
            inputManager = this.app.inputManager,
            status = new Exo.Sprite(resources.get('texture', 'gamepad'));

        status.setOrigin(0.5);
        status.setPosition(width / 2, height / 5);
        status.setTint(inputManager.gamepads[0].connected ? this._connectedColor : this._disconnectedColor);

        return status;
    },

    /**
     * @private
     * @param {ResourceContainer} resources
     * @returns {Container}
     */
    createGamepad(resources) {
        const container = new Exo.Container();

        container.addChild(this.createDPadField(resources));
        container.addChild(this.createFaceButtons(resources));
        container.addChild(this.createShoulderButtons(resources));
        container.addChild(this.createMenuButtons(resources));
        container.addChild(this.createJoysticks(resources));

        return container;
    },

    /**
     * @private
     * @param {ResourceContainer} resources
     * @returns {Container}
     */
    createDPadField(resources) {
        const { width, height } = this.app.canvas,
            mappedButtons = this._mappingButtons,
            container = new Exo.Container(),
            playfield = new Exo.Sprite(resources.get('texture', 'DPadField'));

        mappedButtons.set(Exo.GAMEPAD.DPadUp, playfield);
        mappedButtons.set(Exo.GAMEPAD.DPadDown, playfield);
        mappedButtons.set(Exo.GAMEPAD.DPadLeft, playfield);
        mappedButtons.set(Exo.GAMEPAD.DPadRight, playfield);

        playfield.setScale(1.75);

        container.addChild(playfield);
        container.setOrigin(0.5);
        container.setPosition(width / 5, height / 2);

        return container;
    },

    /**
     * @private
     * @param {ResourceContainer} resources
     * @returns {Container}
     */
    createFaceButtons(resources) {
        const { width, height } = this.app.canvas,
            mappedButtons = this._mappingButtons,
            container = new Exo.Container(),
            buttonTop = new Exo.Sprite(resources.get('texture', 'faceTop')),
            buttonLeft = new Exo.Sprite(resources.get('texture', 'faceLeft')),
            buttonRight = new Exo.Sprite(resources.get('texture', 'faceRight')),
            buttonBottom = new Exo.Sprite(resources.get('texture', 'faceBottom'));

        mappedButtons.set(Exo.GAMEPAD.FaceTop, buttonTop);
        mappedButtons.set(Exo.GAMEPAD.FaceLeft, buttonLeft);
        mappedButtons.set(Exo.GAMEPAD.FaceRight, buttonRight);
        mappedButtons.set(Exo.GAMEPAD.FaceBottom, buttonBottom);

        buttonTop.setScale(0.75);
        buttonTop.setPosition(50, 0);

        buttonLeft.setScale(0.75);
        buttonLeft.setPosition(0, 50);

        buttonRight.setScale(0.75);
        buttonRight.setPosition(100, 50);

        buttonBottom.setScale(0.75);
        buttonBottom.setPosition(50, 100);

        container.addChild(buttonTop);
        container.addChild(buttonLeft);
        container.addChild(buttonRight);
        container.addChild(buttonBottom);
        container.setOrigin(0.5);
        container.setPosition(width * 0.8, height / 2);

        return container;
    },

    /**
     * @private
     * @param {ResourceContainer} resources
     * @returns {Container}
     */
    createShoulderButtons(resources) {
        const { width, height } = this.app.canvas,
            mappedButtons = this._mappingButtons,
            container = new Exo.Container(),
            leftButton = new Exo.Sprite(resources.get('texture', 'shoulderLeftBottom')),
            rightButton = new Exo.Sprite(resources.get('texture', 'shoulderRightBottom')),
            leftTrigger = new Exo.Sprite(resources.get('texture', 'shoulderLeftTop')),
            rightTrigger = new Exo.Sprite(resources.get('texture', 'shoulderRightTop'));

        mappedButtons.set(Exo.GAMEPAD.ShoulderLeftBottom, leftButton);
        mappedButtons.set(Exo.GAMEPAD.ShoulderRightBottom, rightButton);
        mappedButtons.set(Exo.GAMEPAD.ShoulderLeftTop, leftTrigger);
        mappedButtons.set(Exo.GAMEPAD.ShoulderRightTop, rightTrigger);

        leftButton.setPosition(0, 75);

        rightButton.setOrigin(0.5, 0);
        rightButton.setPosition(width * 0.65, 75);

        rightTrigger.setOrigin(0.5, 0);
        rightTrigger.setPosition(width * 0.65, 0);

        container.addChild(leftButton);
        container.addChild(rightButton);
        container.addChild(leftTrigger);
        container.addChild(rightTrigger);
        container.setOrigin(0.5);
        container.setPosition(width / 2, height / 5);

        return container;
    },

    /**
     * @private
     * @param {ResourceContainer} resources
     * @returns {Container}
     */
    createMenuButtons(resources) {
        const { width, height } = this.app.canvas,
            mappedButtons = this._mappingButtons,
            container = new Exo.Container(),
            selectButton = new Exo.Sprite(resources.get('texture', 'select')),
            startButton = new Exo.Sprite(resources.get('texture', 'start')),
            homeButton = new Exo.Sprite(resources.get('texture', 'home'));

        mappedButtons.set(Exo.GAMEPAD.Select, selectButton);
        mappedButtons.set(Exo.GAMEPAD.Start, startButton);
        mappedButtons.set(Exo.GAMEPAD.Home, homeButton);

        homeButton.setOrigin(0.5);
        homeButton.setPosition(width * 0.175, 50);

        startButton.setOrigin(1, 0);
        startButton.setPosition(width * 0.35, 0);

        container.addChild(selectButton);
        container.addChild(startButton);
        container.addChild(homeButton);
        container.setOrigin(0.5);
        container.setPosition(width / 2, height / 2);

        return container;
    },

    /**
     * @private
     * @param {ResourceContainer} resources
     * @returns {Container}
     */
    createJoysticks(resources) {
        const { width, height } = this.app.canvas,
            mappedButtons = this._mappingButtons,
            mappingFunctions = this._mappingFunctions,
            container = new Exo.Container(),
            leftStick = new Exo.Sprite(resources.get('texture', 'leftStick')),
            rightStick = new Exo.Sprite(resources.get('texture', 'rightStick')),
            startLeft = new Exo.Vector(0, 0),
            startRight = new Exo.Vector(width * 0.3, 0),
            range = 35;

        mappedButtons.set(Exo.GAMEPAD.LeftStick, leftStick);
        mappedButtons.set(Exo.GAMEPAD.RightStick, rightStick);

        mappingFunctions.set(Exo.GAMEPAD.LeftStickLeft, (value) => (leftStick.x = Exo.lerp(startLeft.x, startLeft.x - range, value)));
        mappingFunctions.set(Exo.GAMEPAD.LeftStickRight, (value) => (leftStick.x = Exo.lerp(startLeft.x, startLeft.x + range, value)));
        mappingFunctions.set(Exo.GAMEPAD.LeftStickUp, (value) => (leftStick.y = Exo.lerp(startLeft.y, startLeft.y - range, value)));
        mappingFunctions.set(Exo.GAMEPAD.LeftStickDown, (value) => (leftStick.y = Exo.lerp(startLeft.y, startLeft.y + range, value)));

        mappingFunctions.set(Exo.GAMEPAD.RightStickLeft, (value) => (rightStick.x = Exo.lerp(startRight.x, startRight.x - range, value)));
        mappingFunctions.set(Exo.GAMEPAD.RightStickRight, (value) => (rightStick.x = Exo.lerp(startRight.x, startRight.x + range, value)));
        mappingFunctions.set(Exo.GAMEPAD.RightStickUp, (value) => (rightStick.y = Exo.lerp(startRight.y, startRight.y - range, value)));
        mappingFunctions.set(Exo.GAMEPAD.RightStickDown, (value) => (rightStick.y = Exo.lerp(startRight.y, startRight.y + range, value)));

        leftStick.position = startLeft;
        rightStick.position = startRight;

        container.addChild(leftStick);
        container.addChild(rightStick);
        container.setOrigin(0.5, 0);
        container.setPosition(width / 2, height * 0.65);

        return container;
    },
}));
