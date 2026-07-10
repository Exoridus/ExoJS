// Auto-generated from crossfade-tracks.ts — edit the .ts source, not this file.
import { Application, Asset, Assets, Color, crossFade, Graphics, Scene, Text } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});
const PEAK = 0.7;
const COLOR_A = new Color(120, 200, 255);
const COLOR_B = new Color(255, 160, 120);
const METER_W = 120;
const METER_H = 320;
class CrossfadeTracksScene extends Scene {
    trackA;
    trackB;
    trackAVoice;
    trackBVoice;
    toB = true;
    // Displayed meter levels, eased toward each voice's target volume.
    dispA = PEAK;
    dispB = 0;
    graphics;
    labelA;
    labelB;
    nowPlaying;
    tapPrompt;
    // Canvas-relative layout computed in init().
    meterAX = 0;
    meterBX = 0;
    meterBaseY = 0;
    hud;
    async init() {
        const { width, height } = this.app.canvas;
        // Spread the two meters across the wide canvas: each sits a third of the
        // way in from its side, centred on the meter width.
        this.meterAX = width * 0.33 - METER_W / 2;
        this.meterBX = width * 0.67 - METER_W / 2;
        this.meterBaseY = height * 0.82;
        // AudioStream has no seamless adapter — await it explicitly. Both tracks
        // loop; the crossfade only swaps which one is audible.
        const tracks = await this.loader.load(Assets.from({ a: Asset.kind('music', assets.demo.audio.musicA), b: Asset.kind('music', assets.demo.audio.musicB) }));
        this.trackA = tracks.a;
        this.trackB = tracks.b;
        this.graphics = new Graphics();
        this.labelA = new Text('Track A', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(this.meterAX + METER_W / 2, height * 0.26);
        this.labelB = new Text('Track B', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(this.meterBX + METER_W / 2, height * 0.26);
        this.nowPlaying = new Text('', { fillColor: Color.white, fontSize: 20, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height * 0.15);
        // Shown while the browser still blocks audio (`app.audio.locked`); the
        // first click or keypress unlocks it and the queued music starts.
        this.tapPrompt = new Text('Click or press any key to start audio', { fillColor: Color.white, fontSize: 22, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height - 48);
        this.hud = mountControls({
            title: 'Crossfade Tracks',
            controls: [{ keys: 'Click', action: 'crossfade between Track A and Track B (2s)' }],
            status: 'Click or press any key to start…',
            hint: 'The brighter meter with the bar above it is the active track; both loop continuously while their volumes ramp.',
        });
        this.app.input.onPointerTap.add(() => {
            // stopAfter: false keeps both loops alive so we can crossfade back.
            if (this.toB) {
                void crossFade(this.trackAVoice, this.trackBVoice, 2000, { toVolume: PEAK, stopAfter: false });
                this.hud.setStatus('Crossfading to Track B…');
            }
            else {
                void crossFade(this.trackBVoice, this.trackAVoice, 2000, { toVolume: PEAK, stopAfter: false });
                this.hud.setStatus('Crossfading to Track A…');
            }
            this.toB = !this.toB;
        });
        // Core defers playback until the AudioContext unlocks on the first
        // gesture, then starts automatically — start both loops (B silent) so
        // crossFade only has to ramp gains rather than start playback mid-fade.
        this.trackAVoice = this.app.audio.play(this.trackA, { loop: true, volume: PEAK });
        this.trackBVoice = this.app.audio.play(this.trackB, { loop: true, volume: 0 });
        this.hud.setStatus('Track A active — click to crossfade.');
    }
    drawMeter(x, level, active, color) {
        const height = METER_H;
        const baseY = this.meterBaseY;
        const width = METER_W;
        // Background trough.
        this.graphics.fillColor = new Color(45, 45, 45);
        this.graphics.drawRectangle(x, baseY - height, width, height);
        // Filled level (volume 0..PEAK mapped to full height). The inactive
        // track dims to ~45% so the active one reads as the bright one.
        const fill = Math.max(0, Math.min(1, level / PEAK));
        const lit = active ? color : new Color(color.r * 0.45, color.g * 0.45, color.b * 0.45);
        this.graphics.fillColor = lit;
        this.graphics.drawRectangle(x, baseY - height * fill, width, height * fill);
        // Active-track marker bar above the meter.
        if (active) {
            this.graphics.fillColor = new Color(255, 255, 255);
            this.graphics.drawRectangle(x, baseY - height - 12, width, 5);
        }
    }
    draw(context) {
        context.backend.clear();
        this.graphics.clear();
        // voice.volume returns the fade TARGET immediately, so ease the
        // displayed level toward it for a smooth meter during the 2s ramp.
        this.dispA += (this.trackAVoice.volume - this.dispA) * 0.06;
        this.dispB += (this.trackBVoice.volume - this.dispB) * 0.06;
        const aLevel = this.dispA;
        const bLevel = this.dispB;
        const aActive = aLevel >= bLevel;
        this.drawMeter(this.meterAX, aLevel, aActive, COLOR_A);
        this.drawMeter(this.meterBX, bLevel, !aActive, COLOR_B);
        this.labelA.text = `Track A  ${Math.round((aLevel / PEAK) * 100)}%`;
        this.labelB.text = `Track B  ${Math.round((bLevel / PEAK) * 100)}%`;
        this.nowPlaying.text = `Active: Track ${aActive ? 'A' : 'B'}`;
        context.render(this.graphics);
        context.render(this.labelA);
        context.render(this.labelB);
        context.render(this.nowPlaying);
        if (this.app.audio.locked) {
            context.render(this.tapPrompt);
        }
    }
}
app.start(new CrossfadeTracksScene());
