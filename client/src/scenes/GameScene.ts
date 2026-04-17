import Phaser from "phaser";
import { ColyseusClient }  from "../network/ColyseusClient";
import { MapRenderer }     from "../game/MapRenderer";
import { PlayerSprite }    from "../game/PlayerSprite";
import { Interpolator }    from "../game/Interpolator";
import { HUD }             from "../game/HUD";
import type { MapLayoutMessage, IGameState, IPlayerState, RaceResultMessage } from "@shared/types";

const LEVEL_W = 280 * 32;
const LEVEL_H = 18 * 32;

export class GameScene extends Phaser.Scene {
  private playerSprites = new Map<string, PlayerSprite>();
  private playerBodies  = new Map<string, Phaser.Physics.Arcade.Body>();
  private enemySprites  = new Map<number, Phaser.GameObjects.Rectangle>();
  private interpolators = new Map<string, Interpolator>();
  private hud!:          HUD;
  private mapLayout!:    MapLayoutMessage;
  private myId:          string  = "";
  
  // Collision groups
  private groundGroup!:   Phaser.Physics.Arcade.StaticGroup;
  private platformGroup!: Phaser.Physics.Arcade.StaticGroup;

  // Lokalna predykcja
  private localX:        number  = 0;
  private localY:        number  = 0;
  private localVy:       number  = 0;
  private localGrounded: boolean = false;

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
  }

  create(): void {
    // Tło
    this.add.rectangle(LEVEL_W / 2, LEVEL_H / 2, LEVEL_W, LEVEL_H, 0x5C94FC);

    // Mapa
    const { groundGroup, platformGroup } = MapRenderer.build(this, this.mapLayout.tiles);
    this.groundGroup = groundGroup;
    this.platformGroup = platformGroup;

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
    this.applyLocalPrediction(left, right, jump, delta / 1000);

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
          const sprite = new PlayerSprite(this, player);
          this.playerSprites.set(id, sprite);
          
          // Create physics body
          const body = this.physics.add.existing(sprite.sprite, false) as unknown as Phaser.Physics.Arcade.Sprite;
          const physicsBody = body.body as Phaser.Physics.Arcade.Body;
          physicsBody.setSize(24, 40);
          physicsBody.setDrag(0);
          physicsBody.setGravityY(0); // Manual gravity in applyLocalPrediction
          this.playerBodies.set(id, physicsBody);
          
          // Set up collisions
          this.physics.add.collider(sprite.sprite, this.groundGroup, () => {
            this.localGrounded = true;
            this.localVy = 0;
          });
          this.physics.add.collider(sprite.sprite, this.platformGroup, () => {
            this.localGrounded = true;
            this.localVy = 0;
          });
        }
        // Korekta predykcji lokalnej
        const diffX = Math.abs(player.x - this.localX);
        const diffY = Math.abs(player.y - this.localY);
        if (diffX > 16 || diffY > 16) {
          this.localX = Phaser.Math.Linear(this.localX, player.x, 0.3);
          this.localY = Phaser.Math.Linear(this.localY, player.y, 0.3);
        }
        const mySprite = this.playerSprites.get(id);
        mySprite?.update(this.localX, this.localY, player);
        
        if (mySprite) {
          this.cameras.main.startFollow(mySprite.sprite, true, 0.1, 0);
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
      let sprite = this.enemySprites.get(enemy.id);
      if (!sprite) {
        sprite = this.add.rectangle(enemy.x, enemy.y, 28, 28, 0xCC0000)
          .setDepth(1) as unknown as Phaser.GameObjects.Rectangle;
        // Oczy
        this.add.circle(enemy.x - 6, enemy.y - 4, 4, 0xFFFFFF);
        this.add.circle(enemy.x + 6, enemy.y - 4, 4, 0xFFFFFF);
        this.enemySprites.set(enemy.id, sprite);
      }
      sprite.setPosition(enemy.x, enemy.y);
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

  private applyLocalPrediction(
    left:  boolean,
    right: boolean,
    jump:  boolean,
    dt:    number,
  ): void {
    const GRAVITY       = 1800;
    const JUMP_VELOCITY = -620;
    const MOVE_SPEED    = 220;

    const vx = left ? -MOVE_SPEED : right ? MOVE_SPEED : 0;
    this.localVy += GRAVITY * dt;
    if (jump && this.localGrounded) {
      this.localVy       = JUMP_VELOCITY;
      this.localGrounded = false;
    }

    this.localX += vx * dt;
    this.localY += this.localVy * dt;

    // Clamp to level bounds
    this.localX = Phaser.Math.Clamp(this.localX, 0, LEVEL_W - 24);
    
    // Update physics body position
    const physicsBody = this.playerBodies.get(this.myId);
    if (physicsBody) {
      physicsBody.setPosition(this.localX, this.localY);
    }
  }

  // ── Wyniki ────────────────────────────────────────────────────────────────

  private onRaceResult(msg: RaceResultMessage): void {
    this.time.delayedCall(500, () => {
      this.scene.start("ResultsScene", { msg, lobbyUI: (window as any).__lobbyUI });
    });
  }
}
