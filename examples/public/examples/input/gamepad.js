import { Application, Color, Scene, Spritesheet, lerp, Container, GamepadButton, GamepadAxis, Vector, Texture, Json } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(new class extends Scene {

    async load(loader) {
        await loader.load(Texture, { buttons: 'image/buttons.png' });
        await loader.load(Json, { buttons: 'json/buttons.json' });
    }
    init(loader) {
        this._activePad = null;
        this._buttons = new Spritesheet(
            loader.get(Texture, 'buttons'),
            loader.get(Json, 'buttons')
        );
        this._buttonColor = new Color(255, 255, 255, 0.25);
        this._mappingButtons = new Map();
        this._mappingFunctions = new Map();
        this._resetFunctions = [];
        this._padBindings = [];
        this._status = this.createStatus();
        this._container = this.createGamepad();

        for (const sprite of this._mappingButtons.values()) {
            sprite.setTint(this._buttonColor);
        }

        this.app.input.onGamepadConnected.add((pad) => this.handleGamepadConnected(pad));
        this.app.input.onGamepadDisconnected.add((pad) => this.handleGamepadDisconnected(pad));

        for (const pad of this.app.input.gamepads) {
            if (pad.connected) {
                this.setActivePad(pad);
                break;
            }
        }
    }
    draw(backend) {
        backend.clear();
        this._status.render(backend);
        this._container.render(backend);
    }
    handleGamepadConnected(pad) {
        if (!this._activePad) {
            this.setActivePad(pad);
        }
    }
    handleGamepadDisconnected(pad) {
        if (this._activePad !== pad) {
            return;
        }

        const next = this.app.input.gamepads.find((other) => other !== pad && other.connected) || null;
        this.setActivePad(next);
    }
    setActivePad(pad) {
        // Drop previous pad's bindings (auto-detach via .unbind()).
        for (const binding of this._padBindings) {
            binding.unbind();
        }
        this._padBindings.length = 0;

        this._activePad = pad;

        if (!pad) {
            this._status.setTint(this._buttonColor);
            this.resetVisualState();
            return;
        }

        this._status.setTint(Color.white);

        // Subscribe via the new pad-aware listener API.
        for (const [channel, sprite] of this._mappingButtons.entries()) {
            this._padBindings.push(
                pad.onActive(channel, (v) => { sprite.tint.a = lerp(0.25, 1, v); }),
                pad.onStop(channel, () => { sprite.tint.a = this._buttonColor.a; })
            );
        }

        for (const [channel, fn] of this._mappingFunctions.entries()) {
            this._padBindings.push(
                pad.onActive(channel, (v) => { fn(v); }),
                pad.onStop(channel, () => { fn(0); })
            );
        }
    }
    resetVisualState() {
        for (const sprite of this._mappingButtons.values()) {
            sprite.tint.a = this._buttonColor.a;
        }

        for (const reset of this._resetFunctions) {
            reset();
        }
    }
    createStatus() {
        const { width, height } = this.app.canvas;
        const status = this._buttons.getFrameSprite('status');

        status.setAnchor(0.5);
        status.setPosition(width / 2, height / 5);
        status.setTint(this._buttonColor);

        return status;
    }
    createGamepad() {
        const container = new Container();

        container.addChild(this.createDPadField());
        container.addChild(this.createFaceButtons());
        container.addChild(this.createShoulderButtons());
        container.addChild(this.createMenuButtons());
        container.addChild(this.createJoysticks());

        return container;
    }
    createDPadField() {
        const { width, height } = this.app.canvas;
        const mappedButtons = this._mappingButtons;
        const container = new Container();
        const dPad = this._buttons.getFrameSprite('dpad');
        const dPadUp = this._buttons.getFrameSprite('DPadUp');
        const dPadDown = this._buttons.getFrameSprite('DPadDown');
        const dPadLeft = this._buttons.getFrameSprite('DPadLeft');
        const dPadRight = this._buttons.getFrameSprite('DPadRight');

        mappedButtons.set(GamepadButton.DPadUp, dPadUp);
        mappedButtons.set(GamepadButton.DPadDown, dPadDown);
        mappedButtons.set(GamepadButton.DPadLeft, dPadLeft);
        mappedButtons.set(GamepadButton.DPadRight, dPadRight);

        dPad.setTint(this._buttonColor);

        dPad.setScale(1.75);
        dPadUp.setScale(1.75);
        dPadDown.setScale(1.75);
        dPadLeft.setScale(1.75);
        dPadRight.setScale(1.75);

        container.addChild(dPad);
        container.addChild(dPadUp);
        container.addChild(dPadDown);
        container.addChild(dPadLeft);
        container.addChild(dPadRight);

        container.setAnchor(0.5);
        container.setPosition(width / 5, height / 2);

        return container;
    }
    createFaceButtons() {
        const { width, height } = this.app.canvas;
        const mappedButtons = this._mappingButtons;
        const container = new Container();
        const buttonTop = this._buttons.getFrameSprite('FaceTop');
        const buttonLeft = this._buttons.getFrameSprite('FaceLeft');
        const buttonRight = this._buttons.getFrameSprite('FaceRight');
        const buttonBottom = this._buttons.getFrameSprite('FaceBottom');

        mappedButtons.set(GamepadButton.North, buttonTop);
        mappedButtons.set(GamepadButton.West, buttonLeft);
        mappedButtons.set(GamepadButton.East, buttonRight);
        mappedButtons.set(GamepadButton.South, buttonBottom);

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

        container.setAnchor(0.5);
        container.setPosition(width * 0.8, height / 2);

        return container;
    }
    createShoulderButtons() {
        const { width, height } = this.app.canvas;
        const mappedButtons = this._mappingButtons;
        const container = new Container();
        const leftButton = this._buttons.getFrameSprite('ShoulderLeftBottom');
        const rightButton = this._buttons.getFrameSprite('ShoulderRightBottom');
        const leftTrigger = this._buttons.getFrameSprite('ShoulderLeftTop');
        const rightTrigger = this._buttons.getFrameSprite('ShoulderRightTop');

        mappedButtons.set(GamepadButton.LeftShoulder, leftButton);
        mappedButtons.set(GamepadButton.RightShoulder, rightButton);
        mappedButtons.set(GamepadButton.LeftTrigger, leftTrigger);
        mappedButtons.set(GamepadButton.RightTrigger, rightTrigger);

        leftButton.setPosition(0, 75);

        rightButton.setAnchor(0.5, 0);
        rightButton.setPosition(width * 0.65, 75);

        rightTrigger.setAnchor(0.5, 0);
        rightTrigger.setPosition(width * 0.65, 0);

        container.addChild(leftButton);
        container.addChild(rightButton);
        container.addChild(leftTrigger);
        container.addChild(rightTrigger);

        container.setAnchor(0.5);
        container.setPosition(width / 2, height / 5);

        return container;
    }
    createMenuButtons() {
        const { width, height } = this.app.canvas;
        const mappedButtons = this._mappingButtons;
        const container = new Container();
        const selectButton = this._buttons.getFrameSprite('Select');
        const startButton = this._buttons.getFrameSprite('Start');

        mappedButtons.set(GamepadButton.Select, selectButton);
        mappedButtons.set(GamepadButton.Start, startButton);

        startButton.setAnchor(1, 0);
        startButton.setPosition(width * 0.3, 0);

        container.addChild(selectButton);
        container.addChild(startButton);

        container.setAnchor(0.5);
        container.setPosition(width / 2, height / 2);

        return container;
    }
    createJoysticks() {
        const { width, height } = this.app.canvas;
        const mappedButtons = this._mappingButtons;
        const mappingFunctions = this._mappingFunctions;
        const container = new Container();
        const leftStick = this._buttons.getFrameSprite('LeftStick');
        const rightStick = this._buttons.getFrameSprite('RightStick');
        const startLeft = new Vector(0, 0);
        const startRight = new Vector(width * 0.3, 0);
        const range = 35;

        mappedButtons.set(GamepadButton.LeftStick, leftStick);
        mappedButtons.set(GamepadButton.RightStick, rightStick);

        // Aggregate signed axis channels make 2D-stick visualisation
        // a one-liner per axis instead of split-direction subtraction.
        mappingFunctions.set(GamepadAxis.LeftStickX,  (value) => (leftStick.x  = startLeft.x  + value * range));
        mappingFunctions.set(GamepadAxis.LeftStickY,  (value) => (leftStick.y  = startLeft.y  + value * range));
        mappingFunctions.set(GamepadAxis.RightStickX, (value) => (rightStick.x = startRight.x + value * range));
        mappingFunctions.set(GamepadAxis.RightStickY, (value) => (rightStick.y = startRight.y + value * range));

        this._resetFunctions.push(() => {
            leftStick.setPosition(startLeft.x, startLeft.y);
            rightStick.setPosition(startRight.x, startRight.y);
        });

        leftStick.setPosition(startLeft.x, startLeft.y);
        rightStick.setPosition(startRight.x, startRight.y);

        container.addChild(leftStick);
        container.addChild(rightStick);

        container.setAnchor(0.5, 0);
        container.setPosition(width / 2, height * 0.65);

        return container;
    }
});
