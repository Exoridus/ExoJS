import { Application, Color, Container, Graphics, Keyboard, Scene, Text } from '@codexo/exojs';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PLAYER_RADIUS = 18;
const PLAYER_SPEED = 260;
const ORB_RADIUS = 14;
const SPAWN_INTERVAL = 1.2;
const ORB_SPEED_MIN = 80;
const ORB_SPEED_MAX = 200;

// #region guide:application-setup
const app = new Application({
    canvas: {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
    },
    clearColor: new Color(10, 14, 26),
});

document.body.append(app.canvas);
// #endregion guide:application-setup

interface OrbData {
    gfx: Graphics;
    vx: number;
    vy: number;
    danger: boolean;
}

class PlayScene extends Scene {
    private _world!: Container;
    private _player!: Graphics;
    private _orbs: OrbData[] = [];
    private _px = CANVAS_WIDTH / 2;
    private _py = CANVAS_HEIGHT / 2;
    private _dx = 0;
    private _dy = 0;
    private _score = 0;
    private _elapsed = 0;
    private _spawnTimer = 0;
    private _scoreText!: Text;
    private _timeText!: Text;

    override init(): void {
        this._px = CANVAS_WIDTH / 2;
        this._py = CANVAS_HEIGHT / 2;
        this._score = 0;
        this._elapsed = 0;
        this._spawnTimer = 0;
        this._dx = 0;
        this._dy = 0;
        this._orbs = [];

        this._world = new Container();

        this._player = new Graphics();
        this._player.fillColor = new Color(80, 160, 255);
        this._player.drawCircle(0, 0, PLAYER_RADIUS);
        this._player.setPosition(this._px, this._py);
        this._world.addChild(this._player);

        this._scoreText = new Text('Score: 0', { fillColor: Color.white, fontSize: 20 });
        this._scoreText.setPosition(16, 14);

        this._timeText = new Text('0.0 s', { fillColor: Color.white, fontSize: 20 });
        this._timeText.setPosition(CANVAS_WIDTH - 90, 14);

        this.inputs.onActive(Keyboard.W, () => { this._dy = -1; });
        this.inputs.onStop(Keyboard.W, () => { if (this._dy < 0) this._dy = 0; });
        this.inputs.onActive(Keyboard.Up, () => { this._dy = -1; });
        this.inputs.onStop(Keyboard.Up, () => { if (this._dy < 0) this._dy = 0; });

        this.inputs.onActive(Keyboard.S, () => { this._dy = 1; });
        this.inputs.onStop(Keyboard.S, () => { if (this._dy > 0) this._dy = 0; });
        this.inputs.onActive(Keyboard.Down, () => { this._dy = 1; });
        this.inputs.onStop(Keyboard.Down, () => { if (this._dy > 0) this._dy = 0; });

        this.inputs.onActive(Keyboard.A, () => { this._dx = -1; });
        this.inputs.onStop(Keyboard.A, () => { if (this._dx < 0) this._dx = 0; });
        this.inputs.onActive(Keyboard.Left, () => { this._dx = -1; });
        this.inputs.onStop(Keyboard.Left, () => { if (this._dx < 0) this._dx = 0; });

        this.inputs.onActive(Keyboard.D, () => { this._dx = 1; });
        this.inputs.onStop(Keyboard.D, () => { if (this._dx > 0) this._dx = 0; });
        this.inputs.onActive(Keyboard.Right, () => { this._dx = 1; });
        this.inputs.onStop(Keyboard.Right, () => { if (this._dx > 0) this._dx = 0; });
    }

    private _spawnOrb(): void {
        const danger = Math.random() < 0.4;
        const side = Math.floor(Math.random() * 4);
        let ox: number;
        let oy: number;
        switch (side) {
            case 0: ox = Math.random() * CANVAS_WIDTH; oy = -ORB_RADIUS; break;
            case 1: ox = CANVAS_WIDTH + ORB_RADIUS; oy = Math.random() * CANVAS_HEIGHT; break;
            case 2: ox = Math.random() * CANVAS_WIDTH; oy = CANVAS_HEIGHT + ORB_RADIUS; break;
            default: ox = -ORB_RADIUS; oy = Math.random() * CANVAS_HEIGHT; break;
        }
        const tx = CANVAS_WIDTH / 2 + (Math.random() - 0.5) * 300;
        const ty = CANVAS_HEIGHT / 2 + (Math.random() - 0.5) * 300;
        const dist = Math.hypot(tx - ox, ty - oy) || 1;
        const speed = ORB_SPEED_MIN + Math.random() * (ORB_SPEED_MAX - ORB_SPEED_MIN);

        const gfx = new Graphics();
        gfx.fillColor = danger ? new Color(255, 80, 80) : new Color(80, 220, 120);
        gfx.drawCircle(0, 0, ORB_RADIUS);
        gfx.setPosition(ox, oy);
        this._world.addChild(gfx);
        this._orbs.push({ gfx, vx: ((tx - ox) / dist) * speed, vy: ((ty - oy) / dist) * speed, danger });
    }

    override update(delta): void {
        this._elapsed += delta.seconds;
        this._spawnTimer += delta.seconds;

        if (this._spawnTimer >= SPAWN_INTERVAL) {
            this._spawnTimer -= SPAWN_INTERVAL;
            this._spawnOrb();
        }

        const mag = Math.hypot(this._dx, this._dy) || 1;
        if (this._dx !== 0 || this._dy !== 0) {
            this._px += (this._dx / mag) * PLAYER_SPEED * delta.seconds;
            this._py += (this._dy / mag) * PLAYER_SPEED * delta.seconds;
        }
        this._px = Math.max(PLAYER_RADIUS, Math.min(CANVAS_WIDTH - PLAYER_RADIUS, this._px));
        this._py = Math.max(PLAYER_RADIUS, Math.min(CANVAS_HEIGHT - PLAYER_RADIUS, this._py));
        this._player.setPosition(this._px, this._py);

        let gameEnded = false;
        const survived: OrbData[] = [];

        for (const orb of this._orbs) {
            orb.gfx.move(orb.vx * delta.seconds, orb.vy * delta.seconds);

            if (gameEnded) {
                this._world.removeChild(orb.gfx);
                orb.gfx.destroy();
                continue;
            }

            const ox = orb.gfx.x;
            const oy = orb.gfx.y;

            if (ox < -80 || ox > CANVAS_WIDTH + 80 || oy < -80 || oy > CANVAS_HEIGHT + 80) {
                this._world.removeChild(orb.gfx);
                orb.gfx.destroy();
                continue;
            }

            const dist = Math.hypot(ox - this._px, oy - this._py);
            if (dist < PLAYER_RADIUS + ORB_RADIUS) {
                this._world.removeChild(orb.gfx);
                orb.gfx.destroy();
                if (orb.danger) {
                    for (const o of survived) {
                        this._world.removeChild(o.gfx);
                        o.gfx.destroy();
                    }
                    gameEnded = true;
                    continue;
                }
                this._score++;
                this._scoreText.text = `Score: ${this._score}`;
                continue;
            }

            survived.push(orb);
        }

        this._orbs = gameEnded ? [] : survived;

        if (gameEnded) {
            gameOver.setResult(this._score, this._elapsed);
            void this.app.scene.setScene(gameOver);
            return;
        }

        this._timeText.text = `${this._elapsed.toFixed(1)} s`;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._world);
        context.render(this._scoreText);
        context.render(this._timeText);
    }

    override destroy(): void {
        for (const orb of this._orbs) {
            orb.gfx.destroy();
        }
        this._world?.destroy();
        super.destroy();
    }
}

// #region guide:game-over-scene
class GameOverScene extends Scene {
    private _title!: Text;
    private _stats!: Text;
    private _hint!: Text;
    private _finalScore = 0;
    private _finalTime = 0;

    setResult(score: number, time: number): void {
        this._finalScore = score;
        this._finalTime = time;
    }

    override init(): void {
        this._title = new Text('GAME OVER', {
            align: 'center',
            fillColor: new Color(255, 80, 80),
            fontSize: 52,
            fontWeight: 'bold',
        });
        this._title.setAnchor(0.5);
        this._title.setPosition(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 70);

        this._stats = new Text(`Score: ${this._finalScore}   Time: ${this._finalTime.toFixed(1)} s`, {
            align: 'center',
            fillColor: Color.white,
            fontSize: 26,
        });
        this._stats.setAnchor(0.5);
        this._stats.setPosition(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

        this._hint = new Text('Press Space or R to play again', {
            align: 'center',
            fillColor: new Color(160, 160, 160),
            fontSize: 18,
        });
        this._hint.setAnchor(0.5);
        this._hint.setPosition(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 70);

        const restart = (): void => {
            void this.app.scene.setScene(play);
        };
        this.inputs.onTrigger(Keyboard.Space, restart);
        this.inputs.onTrigger(Keyboard.R, restart);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._title);
        context.render(this._stats);
        context.render(this._hint);
    }
}
// #endregion guide:game-over-scene

const play = new PlayScene();
const gameOver = new GameOverScene();

app.start(play);
