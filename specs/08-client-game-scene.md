# Spec 08 — Client Game Scene (Phaser 3)

**Zależności**: spec-00 (typy), spec-01 (index.html), spec-07 (ColyseusClient)  
**Równolegle z**: spec-02–06  
**Integruje się z**: spec-09 (HUD + Interpolator, mogą być w tym samym PR lub osobno)

## Pliki do stworzenia

- `client/src/main.ts`
- `client/src/scenes/BootScene.ts`
- `client/src/scenes/GameScene.ts`
- `client/src/scenes/ResultsScene.ts`
- `client/src/game/MapRenderer.ts`
- `client/src/game/PlayerSprite.ts`

> **HUD i Interpolator** są w spec-09. GameScene integruje je ale nie implementuje.

---

## `client/src/main.ts`

```typescript
import Phaser from "phaser";
import { BootScene }    from "./scenes/BootScene";
import { GameScene }    from "./scenes/GameScene";
import { ResultsScene } from "./scenes/ResultsScene";
import { LobbyUI }      from "./ui/LobbyUI";
import "./ui/lobby.css";

const config: Phaser.Types.Core.GameConfig = {
  type:       Phaser.AUTO,
  width:      800,
  height:     576,
  parent:     "game-container",
  backgroundColor: "#5C94FC",  // sky blue
  scene:      [BootScene, GameScene, ResultsScene],
  physics:    { default: "arcade", arcade: { debug: false } },
};

new Phaser.Game(config);

const lobbyUI = new LobbyUI();
lobbyUI.init();

// Eksport globalny żeby GameScene mógł wywołać lobbyUI.showRoomScreen()
(window as any).__lobbyUI = lobbyUI;
```

---

## `client/src/scenes/BootScene.ts`

Ładuje assety. Jeśli prawdziwe spritesheety nie istnieją, rejestruje placeholdery graficzne.

```typescript
export class BootScene extends Phaser.Scene {
  constructor() { super("BootScene"); }

  preload(): void {
    // Assety są opcjonalne — MapRenderer i PlayerSprite mają fallbacki do prostokątów.
    // Gdy prawdziwe pliki istnieją, dodaj tu:
    //   this.load.image("tiles", "assets/tiles/tileset.png");
    //   this.load.spritesheet("player", "assets/player/player.png", { frameWidth: 48, frameHeight: 48 });
    //   this.load.spritesheet("enemy",  "assets/enemy/enemy.png",   { frameWidth: 32, frameHeight: 32 });
  }

  create(): void {
    // Nie startuj gry automatycznie — GameScene jest uruchamiana przez ColyseusClient.onRaceStart
  }
}
```

---

## `client/src/game/MapRenderer.ts`

Renderuje kafelki z flat array na Phaser StaticGroup.

```typescript
import { Tile } from "@shared/types";
import { CONFIG } from "@shared/types";  // lub importuj stałe bezpośrednio

const TS = 32;  // TILE_SIZE

export class MapRenderer {
  static build(
    scene:  Phaser.Scene,
    tiles:  number[],
    width:  number = 280,
    height: number = 18,
  ): {
    groundGroup:    Phaser.Physics.Arcade.StaticGroup;
    platformGroup:  Phaser.Physics.Arcade.StaticGroup;
    finishGroup:    Phaser.GameObjects.Group;
  } {
    const groundGroup   = scene.physics.add.staticGroup();
    const platformGroup = scene.physics.add.staticGroup();
    const finishGroup   = scene.add.group();

    const hasTileset = scene.textures.exists("tiles");

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const tile = tiles[row * width + col];
        const x    = col * TS + TS / 2;
        const y    = row * TS + TS / 2;

        if (tile === Tile.Ground) {
          const obj = hasTileset
            ? groundGroup.create(x, y, "tiles", 0) as Phaser.Physics.Arcade.Sprite
            : createRect(scene, x, y, TS, TS, 0x8B6914);
          groundGroup.add(obj);

        } else if (tile === Tile.Platform) {
          const obj = hasTileset
            ? scene.add.image(x, y, "tiles", 2)
            : createRect(scene, x, y, TS, 10, 0xC8A86B);
          // Platforma: hitbox tylko górna krawędź (8px)
          const body = scene.physics.add.existing(obj, true) as Phaser.Physics.Arcade.Sprite;
          (body.body as Phaser.Physics.Arcade.StaticBody).setSize(TS, 8).setOffset(0, 0);
          platformGroup.add(body);

        } else if (tile === Tile.Finish) {
          const obj = hasTileset
            ? scene.add.image(x, y, "tiles", 3)
            : createRect(scene, x, y, TS, TS, 0xFFFF00, 0.6);
          finishGroup.add(obj);

        } else if (tile === Tile.Decoration) {
          // Czysto wizualny, bez fizyki
          if (hasTileset) {
            scene.add.image(x, y, "tiles", 4).setAlpha(0.7);
          }
        }
      }
    }

    groundGroup.refresh();
    platformGroup.refresh();
    return { groundGroup, platformGroup, finishGroup };
  }
}

function createRect(
  scene:   Phaser.Scene,
  x: number, y: number,
  w: number, h: number,
  color:   number,
  alpha:   number = 1,
): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(x, y, w, h, color, alpha);
}
```

---

## `client/src/game/PlayerSprite.ts`

Jeden sprite per gracz (lokalny + zdalny).

```typescript
import type { IPlayerState } from "@shared/types";

export class PlayerSprite {
  sprite:    Phaser.GameObjects.Graphics | Phaser.GameObjects.Sprite;
  nameLabel: Phaser.GameObjects.Text;
  ghostMode: boolean = false;

  private color: number;

  constructor(
    private scene:  Phaser.Scene,
    private player: IPlayerState,
  ) {
    this.color = Phaser.Display.Color.HexStringToColor(player.color).color;
    const hasSheet = scene.textures.exists("player");

    if (hasSheet) {
      this.sprite = scene.add.sprite(player.x, player.y, "player");
      this.createAnimations(scene);
    } else {
      // Placeholder: Graphics czyszczony każdą klatkę — unika artefaktów Arc/Rectangle.
      // Rysowany względem origin (0,0), pozycja przez setPosition().
      this.sprite = scene.add.graphics();
      this.drawPlaceholder(this.sprite as Phaser.GameObjects.Graphics, player.x, player.y);
    }

    this.nameLabel = scene.add.text(player.x, player.y - 50, player.name, {
      fontSize:        "11px",
      color:           player.color,
      fontFamily:      "monospace",
      stroke:          "#000",
      strokeThickness: 2,
    }).setOrigin(0.5, 1);
  }

  private drawPlaceholder(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.clear();
    g.fillStyle(this.color, this.ghostMode ? 0.35 : 1);
    g.fillRect(-12, -20, 24, 40);  // ciało względem origin
    g.fillCircle(0, -32, 12);      // głowa względem origin
    g.setPosition(x, y);
  }

  private createAnimations(scene: Phaser.Scene): void {
    const key = `player_${this.player.id}`;
    if (!scene.anims.exists(`${key}_idle`)) {
      scene.anims.create({ key: `${key}_idle`,  frames: [{ key: "player", frame: 0 }],  frameRate: 4,  repeat: -1 });
      scene.anims.create({ key: `${key}_run`,   frames: scene.anims.generateFrameNumbers("player", { start: 1, end: 4 }), frameRate: 12, repeat: -1 });
      scene.anims.create({ key: `${key}_jump`,  frames: [{ key: "player", frame: 5 }],  frameRate: 1,  repeat: 0  });
      scene.anims.create({ key: `${key}_fall`,  frames: [{ key: "player", frame: 6 }],  frameRate: 1,  repeat: 0  });
      scene.anims.create({ key: `${key}_die`,   frames: scene.anims.generateFrameNumbers("player", { start: 7, end: 9 }), frameRate: 8, repeat: 0  });
    }
  }

  update(x: number, y: number, state: IPlayerState): void {
    this.nameLabel.setPosition(x, y - 50);

    if (this.sprite instanceof Phaser.GameObjects.Sprite) {
      this.sprite.setPosition(x, y);
      this.sprite.setTint(Phaser.Display.Color.HexStringToColor(state.color).color);
      this.sprite.setFlipX(!state.facingRight);

      if (state.eliminated) {
        this.sprite.play(`player_${state.id}_die`, true);
      } else if (!state.grounded) {
        this.sprite.play(state.vy < 0 ? `player_${state.id}_jump` : `player_${state.id}_fall`, true);
      } else if (state.vx !== 0) {
        this.sprite.play(`player_${state.id}_run`, true);
      } else {
        this.sprite.play(`player_${state.id}_idle`, true);
      }

      if (this.ghostMode) this.sprite.setAlpha(0.35);
    } else {
      this.color = Phaser.Display.Color.HexStringToColor(state.color).color;
      this.drawPlaceholder(this.sprite as Phaser.GameObjects.Graphics, x, y);
    }
  }

  setGhostMode(): void {
    this.ghostMode = true;
    if (this.sprite instanceof Phaser.GameObjects.Sprite) {
      this.sprite.setAlpha(0.35);
    }
    this.scene.tweens.add({
      targets:  [this.nameLabel],
      alpha:    0.35,
      duration: 500,
    });
  }

  destroy(): void {
    this.sprite.destroy();
    this.nameLabel.destroy();
  }
}
```

---

## `client/src/scenes/GameScene.ts`

Główna scena gry. Zarządza renderingiem, inputem, synchronizacją i kamerą.

```typescript
import { ColyseusClient }   from "../network/ColyseusClient";
import { MapRenderer }      from "../game/MapRenderer";
import { PlayerSprite }     from "../game/PlayerSprite";
import { Interpolator }     from "../game/Interpolator";  // spec-09
import { HUD }              from "../game/HUD";            // spec-09
import type { MapLayoutMessage, IGameState, IPlayerState } from "@shared/types";

const LEVEL_W = 280 * 32;
const LEVEL_H = 18 * 32;

export class GameScene extends Phaser.Scene {
  private playerSprites = new Map<string, PlayerSprite>();
  private enemySprites  = new Map<number, Phaser.GameObjects.Rectangle>();
  private interpolators = new Map<string, Interpolator>();
  private hud!:         HUD;
  private mapLayout!:   MapLayoutMessage;
  private myId:         string = "";

  // Lokalna predykcja
  private localX:       number = 0;
  private localY:       number = 0;
  private localVy:      number = 0;
  private localGrounded:boolean = false;

  // Input state
  private keys!:        Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!:        { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private inputAccumulator: number = 0;
  private lastSeq:      number = 0;
  private lastInput = { left: false, right: false, jump: false };

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
    const { groundGroup, platformGroup } = MapRenderer.build(
      this, this.mapLayout.tiles
    );

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

    // Interpolacja zdalnych graczy + wrogów (spec-09)
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
    state.players.forEach((player, id) => {
      if (id === this.myId) {
        // Utwórz sprite lokalnego gracza przy pierwszym state update
        if (!this.playerSprites.has(id)) {
          this.localX = player.x;
          this.localY = player.y;
          this.playerSprites.set(id, new PlayerSprite(this, player));
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
        if (mySprite) this.cameras.main.startFollow(mySprite.sprite, true, 0.1, 0);
        return;
      }

      // Zdalny gracz — interpolacja
      let interp = this.interpolators.get(id);
      if (!interp) {
        interp = new Interpolator();  // spec-09
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

  // ── Predykcja lokalna ─────────────────────────────────────────────────────

  private applyLocalPrediction(
    left:  boolean,
    right: boolean,
    jump:  boolean,
    dt:    number,
  ): void {
    const GRAVITY        = 1800;
    const JUMP_VELOCITY  = -800;
    const MOVE_SPEED     = 220;

    const vx = left ? -MOVE_SPEED : right ? MOVE_SPEED : 0;
    this.localVy += GRAVITY * dt;
    if (jump && this.localGrounded) {
      this.localVy     = JUMP_VELOCITY;
      this.localGrounded = false;
    }

    this.localX += vx * dt;
    this.localY += this.localVy * dt;

    // Prosta kolizja z podłogą (aproksymacja — serwer jest autorytatywny)
    const floorY = (18 - 2) * 32 - 40;  // rząd 16 - PLAYER_H
    if (this.localY > floorY) {
      this.localY        = floorY;
      this.localVy       = 0;
      this.localGrounded = true;
    }

    this.localX = Phaser.Math.Clamp(this.localX, 0, LEVEL_W - 24);
  }

  // ── Wyniki ────────────────────────────────────────────────────────────────

  private onRaceResult(msg: import("@shared/types").RaceResultMessage): void {
    this.time.delayedCall(500, () => {
      this.scene.start("ResultsScene", { msg, lobbyUI: (window as any).__lobbyUI });
    });
  }
}
```

---

## `client/src/scenes/ResultsScene.ts`

```typescript
import type { RaceResultMessage } from "@shared/types";

export class ResultsScene extends Phaser.Scene {
  constructor() { super("ResultsScene"); }

  create(data: { msg: RaceResultMessage; lobbyUI: { showRoomScreen(): void } }): void {
    const { results } = data.msg;

    this.add.rectangle(400, 288, 800, 576, 0x000000, 0.8);
    this.add.text(400, 80, "Race Results", { fontSize: "32px", color: "#fff" }).setOrigin(0.5);

    const sorted = [...results].sort((a, b) => a.position - b.position || b.pointsEarned - a.pointsEarned);

    sorted.forEach((r, i) => {
      const y   = 150 + i * 44;
      const pos = r.position > 0 ? `${r.position}.` : "—";
      this.add.text(200, y, `${pos}  ${r.name}`, { fontSize: "20px", color: "#eee" });
      this.add.text(520, y, `+${r.pointsEarned} pts`, { fontSize: "20px", color: "#F39C12" }).setOrigin(1, 0);
      this.add.text(620, y, `Total: ${r.totalScore}`, { fontSize: "16px", color: "#aaa" }).setOrigin(1, 0);
    });

    // Odliczanie powrotu
    let countdown = 8;
    const countText = this.add.text(400, 500, `Returning to room in ${countdown}s...`,
      { fontSize: "16px", color: "#888" }).setOrigin(0.5);

    this.time.addEvent({
      delay: 1000,
      repeat: 7,
      callback: () => {
        countdown--;
        countText.setText(`Returning to room in ${countdown}s...`);
        if (countdown <= 0) {
          this.scene.stop("ResultsScene");
          this.scene.stop("GameScene");
          data.lobbyUI.showRoomScreen();
        }
      },
    });
  }
}
```

---

## Uruchomienie GameScene z LobbyUI (integracja)

W `LobbyUI.ts` (spec-06), callback `onRaceStart`:

```typescript
ColyseusClient.onRaceStart((layout) => {
  this.hideAllScreens();
  const game = (window as any).__phaserGame as Phaser.Game;
  game.scene.start("GameScene", { layout });
});
```

Phaser game instance musi być eksportowany globalnie z `main.ts`:

```typescript
// main.ts
const game = new Phaser.Game(config);
(window as any).__phaserGame = game;
```

---

## Uwagi

- **Predykcja lokalna** jest uproszczona — tylko podłoga, bez kafelkowych kolizji. Serwer koryguje gdy rozbieżność > 16px.
- Wrogowie są renderowani jako placeholder — koordynacja z assetami (spec-09 lub osobny task).
- `startFollow` z `lerp 0.1` daje miękki follow kamerą.
- Kamera ma `setBounds` — nie wychodzi poza poziom.
