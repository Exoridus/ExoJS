const app = new Exo.Application({
    resourcePath: 'assets/',
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
            buttons: 'image/buttons.png',
        });

        loader.add('json', {
            buttons: 'json/buttons.json',
        });
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {

        /**
         * @private
         * @member {Gamepad}
         */
        this._gamepad = this.app.inputManager.gamepads[0];

        /**
         * @private
         * @member {Spritesheet}
         */
        this._buttons = new Exo.Spritesheet(
            resources.get('texture', 'buttons'),
            resources.get('json', 'buttons')
        );

        /**
         * @private
         * @member {Color}
         */
        this._buttonColor = new Exo.Color(255, 255, 255, 0.25);

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
        this._status = this.createStatus();

        /**
         * @private
         * @member {Container}
         */
        this._container = this.createGamepad();

        for (const sprite of this._mappingButtons.values()) {
            sprite.setTint(this._buttonColor);
        }

        this._gamepad.on('connect', (channel, value) => this._status.setTint(Exo.Color.White));
        this._gamepad.on('disconnect', (channel, value) => this._status.setTint(this._buttonColor));
        this._gamepad.on('update', (channel, value) => {
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
     * @returns {Container}
     */
    createStatus() {
        const { width, height } = this.app.canvas,
            status = this._buttons.sprites['status'];

        status.setOrigin(0.5);
        status.setPosition(width / 2, height / 5);

        if (!this._gamepad.connected) {
            status.setTint(this._buttonColor);
        }

        return status;
    },

    /**
     * @private
     * @returns {Container}
     */
    createGamepad() {
        const container = new Exo.Container();

        container.addChild(this.createDPadField());
        container.addChild(this.createFaceButtons());
        container.addChild(this.createShoulderButtons());
        container.addChild(this.createMenuButtons());
        container.addChild(this.createJoysticks());

        return container;
    },

    /**
     * @private
     * @returns {Container}
     */
    createDPadField() {
        const { width, height } = this.app.canvas,
            mappedButtons = this._mappingButtons,
            container = new Exo.Container(),
            dpad = this._buttons.sprites['dpad'],
            dpadUp = this._buttons.sprites['DPadUp'],
            dpadDown = this._buttons.sprites['DPadDown'],
            dpadLeft = this._buttons.sprites['DPadLeft'],
            dpadRight = this._buttons.sprites['DPadRight'];

        mappedButtons.set(Exo.GAMEPAD.DPadUp, dpadUp);
        mappedButtons.set(Exo.GAMEPAD.DPadDown, dpadDown);
        mappedButtons.set(Exo.GAMEPAD.DPadLeft, dpadLeft);
        mappedButtons.set(Exo.GAMEPAD.DPadRight, dpadRight);

        dpad.setTint(this._buttonColor);

        dpad.setScale(1.75);
        dpadUp.setScale(1.75);
        dpadDown.setScale(1.75);
        dpadLeft.setScale(1.75);
        dpadRight.setScale(1.75);

        container.addChild(dpad);
        container.addChild(dpadUp);
        container.addChild(dpadDown);
        container.addChild(dpadLeft);
        container.addChild(dpadRight);

        container.setOrigin(0.5);
        container.setPosition(width / 5, height / 2);

        return container;
    },

    /**
     * @private
     * @returns {Container}
     */
    createFaceButtons() {
        const { width, height } = this.app.canvas,
            mappedButtons = this._mappingButtons,
            container = new Exo.Container(),
            buttonTop = this._buttons.sprites['FaceTop'],
            buttonLeft = this._buttons.sprites['FaceLeft'],
            buttonRight = this._buttons.sprites['FaceRight'],
            buttonBottom = this._buttons.sprites['FaceBottom'];

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
     * @returns {Container}
     */
    createShoulderButtons() {
        const { width, height } = this.app.canvas,
            mappedButtons = this._mappingButtons,
            container = new Exo.Container(),
            leftButton = this._buttons.sprites['ShoulderLeftBottom'],
            rightButton = this._buttons.sprites['ShoulderRightBottom'],
            leftTrigger = this._buttons.sprites['ShoulderLeftTop'],
            rightTrigger = this._buttons.sprites['ShoulderRightTop'];

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
     * @returns {Container}
     */
    createMenuButtons() {
        const { width, height } = this.app.canvas,
            mappedButtons = this._mappingButtons,
            container = new Exo.Container(),
            selectButton = this._buttons.sprites['Select'],
            startButton = this._buttons.sprites['Start'];

        mappedButtons.set(Exo.GAMEPAD.Select, selectButton);
        mappedButtons.set(Exo.GAMEPAD.Start, startButton);

        startButton.setOrigin(1, 0);
        startButton.setPosition(width * 0.3, 0);

        container.addChild(selectButton);
        container.addChild(startButton);

        container.setOrigin(0.5);
        container.setPosition(width / 2, height / 2);

        return container;
    },

    /**
     * @private
     * @returns {Container}
     */
    createJoysticks() {
        const { width, height } = this.app.canvas,
            mappedButtons = this._mappingButtons,
            mappingFunctions = this._mappingFunctions,
            container = new Exo.Container(),
            leftStick = this._buttons.sprites['LeftStick'],
            rightStick = this._buttons.sprites['RightStick'],
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