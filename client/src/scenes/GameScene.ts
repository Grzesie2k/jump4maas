import Phaser from "phaser";
import { ColyseusClient }  from "../network/ColyseusClient";
import { MapRenderer }     from "../game/MapRenderer";
import { PlayerSprite }    from "../game/PlayerSprite";
import { Interpolator }    from "../game/Interpolator";
import { HUD }             from "../game/HUD";
import type { MapLayoutMessage, IGameState, IPlayerState, RaceResultMessage } from "@shared/types";
import { Tile } from "@shared/types";

const LEVEL_W = 280 * 32;
const LEVEL_H = 18 * 32;

export class GameScene extends Phaser.Scene {
  private playerSprites = new Map<string, PlayerSprite>();
  private enemySprites  = new Map<number, Phaser.GameObjects.Container>();
  private interpolators = new Map<string, Interpolator>();
  private hud!:          HUD;
  private mapLayout!:    MapLayoutMessage;
  private myId:          string  = "";

  // Lokalna predykcja
  private localX:          number  = 0;
  private localY:          number  = 0;
  private localVy:         number  = 0;
  private localGrounded:   boolean = false;
  private localEliminated:   boolean = false;
  private cameraFollowing:   boolean = false;

  // Input state
  private keys!:        Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!:        { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private inputAccumulator: number = 0;
  private lastSeq:          number = 0;
  private lastInput = { left: false, right: false, jump: false };

  // Countdown overlay
  private countdownText?: Phaser.GameObjects.Text;

  constructor() { super("GameScene"); }

  // Wywołana gdy ColyseusClient.onRaceStart odpalił
  init(data: { layout: MapLayoutMessage }): void {
    this.mapLayout = data.layout;
    this.myId      = ColyseusClient.sessionId;

    // Reset per-race state (Phaser reuses the instance on scene.start)
    this.playerSprites.clear();
    this.enemySprites.clear();
    this.interpolators.clear();
    this.localX          = 0;
    this.localY          = 0;
    this.localVy         = 0;
    this.localGrounded   = false;
    this.localEliminated = false;
    this.cameraFollowing = false;
    this.inputAccumulator = 0;
    this.lastSeq          = 0;
    this.lastInput        = { left: false, right: false, jump: false };
    this.countdownText    = undefined;
  }

  create(): void {
    // Tło
    this.add.rectangle(LEVEL_W / 2, LEVEL_H / 2, LEVEL_W, LEVEL_H, 0x5C94FC);

    // Mapa
    MapRenderer.build(this, this.mapLayout.tiles);

    // Klawiatura
    this.keys = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard!.addKey("W"),
      A: this.input.keyboard!.addKey("A"),
      S: this.input.keyboard!.addKey("S"),
      D: this.input.keyboard!.addKey("D"),
    };

    // Kamera
    this.cameras.main
      .setBounds(0, 0, LEVEL_W, LEVEL_H)
      .setBackgroundColor("#5C94FC");

    // HUD (spec-09)
    this.hud = new HUD(this, this.mapLayout.finishX);

    // Serwer state
    ColyseusClient.onRoomStateChange((state) => this.syncState(state));
    ColyseusClient.onRaceResult((msg)         => this.onRaceResult(msg));
    ColyseusClient.onPlayerEliminated((data)  => {
      const sprite = this.playerSprites.get(data.playerId);
      sprite?.setGhostMode();
    });
  }

  update(_time: number, delta: number): void {
    if (!this.mapLayout) return;

    const left  = this.keys.left.isDown  || this.wasd.A.isDown;
    const right = this.keys.right.isDown || this.wasd.D.isDown;
    const jump  = this.keys.up.isDown    || this.wasd.W.isDown ||
                  this.keys.space.isDown;

    const inputChanged = left !== this.lastInput.left ||
                         right !== this.lastInput.right ||
                         jump  !== this.lastInput.jump;

    this.inputAccumulator += delta;
    if (inputChanged || this.inputAccumulator >= 50) {
      ColyseusClient.sendInput({ left, right, jump, seq: ++this.lastSeq });
      this.lastInput        = { left, right, jump };
      this.inputAccumulator = 0;
    }

    // Client-side prediction dla lokalnego gracza
    if (!this.localEliminated) {
      this.applyLocalPrediction(left, right, jump, delta / 1000);
    }

    // Interpolacja zdalnych graczy (spec-09)
    const now = Date.now();
    this.interpolators.forEach((interp, id) => {
      const sprite = this.playerSprites.get(id);
      if (!sprite) return;
      const pos = interp.getPosition(now);
      sprite.update(pos.x, pos.y, interp.latestState);
    });

    this.hud.update(ColyseusClient.currentRoom?.state as unknown as IGameState);
  }

  // ── Synchronizacja stanu ──────────────────────────────────────────────────

  private syncState(state: IGameState): void {
    // Countdown overlay
    if (state.phase === "countdown" && state.countdown > 0) {
      this.showCountdown(state.countdown);
    } else if (state.phase === "racing") {
      this.showCountdown(0); // "GO!"
    }

    state.players.forEach((player, id) => {
      if (id === this.myId) {
        if (!this.playerSprites.has(id)) {
          this.localX = player.x;
          this.localY = player.y;
          this.playerSprites.set(id, new PlayerSprite(this, player));
        }
        // Korekta predykcji lokalnej
        if (player.eliminated) {
          this.localEliminated = true;
          this.localX  = player.x;
          this.localY  = player.y;
          this.localVy = 0;
        } else {
          const diffX = Math.abs(player.x - this.localX);
          const diffY = Math.abs(player.y - this.localY);
          if (diffX > 200 || diffY > 200) {
            // Respawn — teleport immediately so gravity doesn't fight the lerp
            this.localX  = player.x;
            this.localY  = player.y;
            this.localVy = 0;
          } else if (diffX > 16 || diffY > 16) {
            this.localX = Phaser.Math.Linear(this.localX, player.x, 0.3);
            this.localY = Phaser.Math.Linear(this.localY, player.y, 0.3);
          }
        }
        if (player.grounded) {
          this.localGrounded = true;
          this.localVy = 0;
          this.localY  = player.y;  // snap Y — prevents gravity drift between server ticks
        }
        const mySprite = this.playerSprites.get(id);
        mySprite?.update(this.localX, this.localY, player);
        
        if (mySprite && !this.cameraFollowing) {
          this.cameras?.main?.startFollow(mySprite.sprite, true, 0.1, 0);
          this.cameraFollowing = true;
        }
        return;
      }

      // Zdalny gracz — interpolacja
      let interp = this.interpolators.get(id);
      if (!interp) {
        interp = new Interpolator();
        this.interpolators.set(id, interp);
      }
      interp.addSample(player.x, player.y, player as IPlayerState);

      if (!this.playerSprites.has(id)) {
        this.playerSprites.set(id, new PlayerSprite(this, player));
      }
    });

    // Wrogowie
    state.enemies.forEach((enemy) => {
      let container = this.enemySprites.get(enemy.id);
      if (!container) {
        const BROWN      = 0xB35900;
        const DARK_BROWN = 0x5C2A00;
        const TAN        = 0xE8C068;

        const body    = this.add.ellipse(0, 0, 28, 22, BROWN);
        const belly   = this.add.ellipse(0, 7, 20, 10, TAN);
        const footL   = this.add.ellipse(-8, 13, 12, 7, DARK_BROWN);
        const footR   = this.add.ellipse( 8, 13, 12, 7, DARK_BROWN);
        const eyeWL   = this.add.circle(-7, -2, 5, 0xFFFFFF);
        const eyeWR   = this.add.circle( 7, -2, 5, 0xFFFFFF);
        const pupilL  = this.add.circle(-6, -1, 3, 0x111111);
        const pupilR  = this.add.circle( 8, -1, 3, 0x111111);
        const browL   = this.add.rectangle(-7, -8, 9, 3, DARK_BROWN).setAngle( 20);
        const browR   = this.add.rectangle( 7, -8, 9, 3, DARK_BROWN).setAngle(-20);

        container = this.add.container(enemy.x, enemy.y,
          [body, belly, footL, footR, eyeWL, eyeWR, pupilL, pupilR, browL, browR],
        ).setDepth(1);
        this.enemySprites.set(enemy.id, container);
      }
      container.setPosition(enemy.x, enemy.y);
      container.setScale(enemy.facingRight ? 1 : -1, 1);
    });

    this.hud.update(state);
  }

  // ── Countdown overlay ─────────────────────────────────────────────────────

  private showCountdown(n: number): void {
    if (!this.countdownText) {
      this.countdownText = this.add.text(400, 250, "", {
        fontSize:        "96px",
        color:           "#fff",
        stroke:          "#000",
        strokeThickness: 6,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(200);
    }
    this.countdownText.setText(n > 0 ? String(n) : "GO!");
    if (n === 0) {
      this.time.delayedCall(700, () => this.countdownText?.setVisible(false));
    }
  }

  // ── Predykcja lokalna ─────────────────────────────────────────────────────

  // tiles are always TS×TS squares, so width==height==ts
  private static aabbOverlap(
    px: number, py: number, pw: number, ph: number,
    tx: number, ty: number, ts: number,
  ): { overlapX: number; overlapY: number } | null {
    const ox = (px + pw / 2) - (tx + ts / 2);
    const oy = (py + ph / 2) - (ty + ts / 2);
    const hw = (pw + ts) / 2;
    const hh = (ph + ts) / 2;
    if (Math.abs(ox) >= hw || Math.abs(oy) >= hh) return null;
    return { overlapX: hw - Math.abs(ox), overlapY: hh - Math.abs(oy) };
  }

  private resolveTiles(
    newX: number, newY: number, prevY: number, inVy: number,
  ): { x: number; y: number; vy: number; grounded: boolean } {
    const TS = 32, TW = 280, TH = 18, PW = 24, PH = 40;
    const tiles  = this.mapLayout.tiles;
    const colMin = Math.max(0,      Math.floor(newX / TS) - 1);
    const colMax = Math.min(TW - 1, Math.floor((newX + PW) / TS) + 1);
    const rowMin = Math.max(0,      Math.floor(newY / TS) - 1);
    const rowMax = Math.min(TH - 1, Math.floor((newY + PH) / TS) + 1);

    const s = { x: newX, y: newY, vy: inVy, grounded: false };
    for (let row = rowMin; row <= rowMax; row++) {
      for (let col = colMin; col <= colMax; col++) {
        const tile = tiles[row * TW + col];
        if (tile) this.resolveOneTile(s, prevY, col, row, tile);
      }
    }
    return s;
  }

  private resolveOneTile(
    s: { x: number; y: number; vy: number; grounded: boolean },
    prevY: number, col: number, row: number, tile: number,
  ): void {
    const PW = 24, PH = 40, TS = 32;
    if (tile === Tile.Platform) {
      const tileTop = row * TS;
      if (s.vy > 0 && prevY + PH <= tileTop + 2) {
        const ov = GameScene.aabbOverlap(s.x, s.y, PW, PH, col * TS, tileTop, TS);
        if (ov) { s.y = tileTop - PH; s.vy = 0; s.grounded = true; }
      }
    } else if (tile === Tile.Ground) {
      const ov = GameScene.aabbOverlap(s.x, s.y, PW, PH, col * TS, row * TS, TS);
      if (ov) this.resolveGround(s, ov, col, row);
    }
  }

  private resolveGround(
    s:  { x: number; y: number; vy: number; grounded: boolean },
    ov: { overlapX: number; overlapY: number },
    col: number, row: number,
  ): void {
    const PW = 24, PH = 40, TS = 32;
    if (ov.overlapX < ov.overlapY) {
      const push = (s.x + PW / 2) < (col * TS + TS / 2) ? -ov.overlapX : ov.overlapX;
      s.x += push;
    } else if ((s.y + PH / 2) < (row * TS + TS / 2)) {
      s.y -= ov.overlapY; s.vy = 0; s.grounded = true;
    } else {
      s.y += ov.overlapY; s.vy = 0;
    }
  }

  private applyLocalPrediction(
    left:  boolean,
    right: boolean,
    jump:  boolean,
    dt:    number,
  ): void {
    const GRAVITY = 1800, JUMP_VELOCITY = -800, MOVE_SPEED = 220;

    const vx = left ? -MOVE_SPEED : right ? MOVE_SPEED : 0;
    this.localVy += GRAVITY * dt;
    if (jump && this.localGrounded) {
      this.localVy = JUMP_VELOCITY;
      this.localGrounded = false;
    }

    const resolved = this.resolveTiles(
      this.localX + vx * dt,
      this.localY + this.localVy * dt,
      this.localY,
      this.localVy,
    );

    this.localGrounded = resolved.grounded;
    this.localVy       = resolved.vy;
    this.localX        = Phaser.Math.Clamp(resolved.x, 0, LEVEL_W - 24);
    this.localY        = resolved.y;
  }

  // ── Wyniki ────────────────────────────────────────────────────────────────

  private onRaceResult(msg: RaceResultMessage): void {
    this.time.delayedCall(500, () => {
      this.scene.start("ResultsScene", { msg, lobbyUI: (window as any).__lobbyUI });
    });
  }
}
