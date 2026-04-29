import { Application, Color, Scene, Text, TextStyle } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.darkSlateBlue,
    backend: { type: 'webgpu' },
});

document.body.append(app.canvas);

app.start(new class extends Scene {

    init() {
        const { width } = this.app.canvas;

        this._headline = new Text('WebGPU Text', new TextStyle({
            fill: '#f7f2ff',
            stroke: '#16213a',
            strokeThickness: 5,
            fontSize: 42,
            fontWeight: '900',
            fontFamily: 'Georgia',
            padding: 10,
        }));
        this._headline.setAnchor(0.5);
        this._headline.setPosition(width / 2, 92);

        this._subhead = new Text('Smaller text with a lighter stroke.', new TextStyle({
            fill: '#c7f0ff',
            stroke: '#0d1b2a',
            strokeThickness: 2,
            fontSize: 20,
            fontWeight: '700',
            fontFamily: 'Trebuchet MS',
            padding: 6,
        }));
        this._subhead.setAnchor(0.5);
        this._subhead.setPosition(width / 2, 150);

        this._multiline = new Text('Multiline text\nworks as expected\non the built-in path.', new TextStyle({
            fill: '#ffd6a5',
            stroke: '#3d2b1f',
            strokeThickness: 3,
            fontSize: 28,
            fontWeight: '800',
            fontFamily: 'Verdana',
            align: 'center',
            padding: 8,
        }));
        this._multiline.setAnchor(0.5);
        this._multiline.setPosition(225, 330);

        this._wrapped = new Text(
            'Word wrap is rendered through the normal Text and TextStyle API, without any backend-specific integration path in the example.',
            new TextStyle({
                fill: '#ffffff',
                stroke: '#1f2a44',
                strokeThickness: 2,
                fontSize: 24,
                fontWeight: '700',
                fontFamily: 'Arial',
                wordWrap: true,
                wordWrapWidth: 260,
                padding: 10,
            })
        );
        this._wrapped.setAnchor(0.5);
        this._wrapped.setPosition(585, 335);
    }
    update(delta) {
        const time = this.app.activeTime.seconds;

        this._headline.rotate(delta.seconds * 14);
        this._headline.y = 92 + Math.sin(time * 1.9) * 8;
        this._subhead.setTint(new Color(
            190 + (Math.sin(time * 2.2) * 45),
            220 + (Math.sin(time * 1.4) * 20),
            255,
            1
        ));
    }
    draw(backend) {
        backend.clear();
        this._headline.render(backend);
        this._subhead.render(backend);
        this._multiline.render(backend);
        this._wrapped.render(backend);
    }
    unload() {
        this._headline?.destroy();
        this._subhead?.destroy();
        this._multiline?.destroy();
        this._wrapped?.destroy();
        this._headline = null;
        this._subhead = null;
        this._multiline = null;
        this._wrapped = null;
    }
    destroy() {
        this._headline?.destroy();
        this._subhead?.destroy();
        this._multiline?.destroy();
        this._wrapped?.destroy();
        this._headline = null;
        this._subhead = null;
        this._multiline = null;
        this._wrapped = null;
    }
}).catch((error) => {
    app.canvas.remove();
    app.destroy();

    throw error;
});

