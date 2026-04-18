import { Application, Color, Texture, Sound, defineAssetManifest } from 'exojs';

const manifest = defineAssetManifest({
    bundles: {
        boot: [
            { type: Texture, alias: 'logo', path: 'ui/logo.png' },
            { type: Sound, alias: 'click', path: 'audio/click.wav' },
        ],
        shared: [
            { type: Texture, alias: 'atlas', path: 'sprites/atlas.png' },
        ],
        gameplay: [
            { type: Texture, alias: 'player', path: 'sprites/player.png' },
            { type: Texture, alias: 'atlas', path: 'sprites/atlas.png' },
        ],
    },
});

async function preload(app: Application): Promise<void> {
    app.loader.registerManifest(manifest);

    app.loader.onBundleProgress.add((name, loaded, total) => {
        console.log(`[bundle:${name}] ${loaded}/${total}`);
    });

    await app.loader.loadBundle('boot', {
        onProgress(loaded, total) {
            console.log(`boot progress: ${loaded}/${total}`);
        },
    });

    await app.loader.loadBundle('shared', { background: true });
}

async function main(): Promise<void> {
    const canvas = document.querySelector<HTMLCanvasElement>('#app');

    if (!canvas) {
        throw new Error('Missing #app canvas element.');
    }

    const app = new Application({
        canvas,
        width: 800,
        height: 600,
        clearColor: Color.black,
    });

    await preload(app);

    const logo = app.loader.get(Texture, 'logo');
    const click = app.loader.get(Sound, 'click');

    console.log('loaded assets', { logo, click });
}

void main();
