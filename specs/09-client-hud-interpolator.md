# Spec 09 — Client HUD + Interpolator

**Zależności**: spec-00 (IGameState), spec-08 (GameScene, PlayerSprite)  
**Równolegle z**: spec-02–07 (niezależne od serwera)  
**Implementowane w**: `client/src/game/`

## Pliki do stworzenia

- `client/src/game/Interpolator.ts`
- `client/src/game/HUD.ts`

---

## `client/src/game/Interpolator.ts`

Wygładza pozycje zdalnych graczy i wrogów z 20Hz serwera do 60fps klienta.

### Strategia

Buforuj ostatnie 2 próbki z timestampami. Renderuj z opóźnieniem 100ms (render lag), interpolując liniowo między próbkami.

```typescript
import type { IPlayerState } from "@shared/types";

interface Sample {
  x:         number;
  y:         number;
  timestamp: number;
}

export class Interpolator {
  private buffer:  Sample[]       = [];
  latestState!:    IPlayerState;

  addSample(x: number, y: number, state: IPlayerState): void {
    this.buffer.push({ x, y, timestamp: Date.now() });
    if (this.buffer.length > 3) this.buffer.shift();
    this.latestState = state;
  }

  getPosition(now: number): { x: number; y: number } {
    const RENDER_LAG = 100;  // ms
    const renderTime = now - RENDER_LAG;

    if (this.buffer.length < 2) {
      return this.buffer[0] ?? { x: 0, y: 0 };
    }

    // Znajdź parę próbek otaczającą renderTime
    for (let i = this.buffer.length - 1; i >= 1; i--) {
      const b = this.buffer[i];
      const a = this.buffer[i - 1];
      if (renderTime >= a.timestamp && renderTime <= b.timestamp) {
        const t = (renderTime - a.timestamp) / (b.timestamp - a.timestamp);
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
        };
      }
    }

    // Rendertime za stary lub za nowy — użyj ostatniej próbki
    return this.buffer[this.buffer.length - 1];
  }
}
```

---

## `client/src/game/HUD.ts`

HUD renderowany jako Phaser GameObjects przypiętych do kamery (setScrollFactor(0)).

### Layout

```
┌──────────────────────────────────────────────┐  y=0
│ ♥♥♥  PlayerName              1st 2nd 3rd     │  h=40 (top bar)
│                                              │
│            [ GAME WORLD ]                    │
│                                              │
│ ════════════════════════════════════════════  │  y=564 (minimap strip h=12)
└──────────────────────────────────────────────┘  y=576
```

```typescript
import type { IGameState } from "@shared/types";
import { ColyseusClient }  from "../network/ColyseusClient";

const HEART_FULL  = "♥";
const HEART_EMPTY = "♡";
const COLORS = ["#E74C3C", "#3498DB", "#2ECC71", "#F39C12", "#9B59B6"];

export class HUD {
  private topBar:      Phaser.GameObjects.Rectangle;
  private heartsText:  Phaser.GameObjects.Text;
  private nameText:    Phaser.GameObjects.Text;
  private standings:   Phaser.GameObjects.Text;
  private minimapBg:   Phaser.GameObjects.Rectangle;
  private dotPool:     Phaser.GameObjects.Arc[]   = [];
  private finishFlag:  Phaser.GameObjects.Text;

  constructor(
    private scene:   Phaser.Scene,
    private finishX: number,   // px, do obliczeń minimapy
  ) {
    this.buildTopBar();
    this.buildMinimap();
  }

  private buildTopBar(): void {
    this.topBar = this.scene.add
      .rectangle(400, 20, 800, 40, 0x000000, 0.65)
      .setScrollFactor(0)
      .setDepth(100);

    this.heartsText = this.scene.add
      .text(12, 10, "", { fontSize: "18px", color: "#E74C3C" })
      .setScrollFactor(0)
      .setDepth(101);

    this.nameText = this.scene.add
      .text(12, 28, "", { fontSize: "10px", color: "#ccc" })
      .setScrollFactor(0)
      .setDepth(101);

    this.standings = this.scene.add
      .text(788, 10, "", { fontSize: "13px", color: "#fff", align: "right" })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(101);
  }

  private buildMinimap(): void {
    const W = 800, H = 12, Y = 576 - H;

    this.minimapBg = this.scene.add
      .rectangle(W / 2, Y + H / 2, W, H, 0x000000, 0.6)
      .setScrollFactor(0)
      .setDepth(100);

    this.finishFlag = this.scene.add
      .text(0, Y, "⚑", { fontSize: "10px", color: "#ffff00" })
      .setScrollFactor(0)
      .setDepth(102);
  }

  update(state: IGameState): void {
    if (!state) return;

    const myId    = ColyseusClient.sessionId;
    const myState = state.players.get(myId);

    // Hearts
    if (myState) {
      const hearts = Array.from({ length: 3 }, (_, i) =>
        i < myState.lives ? HEART_FULL : HEART_EMPTY
      ).join(" ");
      this.heartsText.setText(hearts);
      this.nameText.setText(myState.name);
    }

    // Standings (top right)
    const sorted = [...state.players.values()]
      .filter((p) => p.finished || p.eliminated || true)  // wszyscy
      .sort((a, b) => {
        if (a.finished && !b.finished) return -1;
        if (!a.finished && b.finished) return 1;
        if (a.eliminated && !b.eliminated) return 1;
        if (!a.eliminated && b.eliminated) return -1;
        return b.x - a.x;  // kto dalej
      });

    const standingLines = sorted.slice(0, 5).map((p, i) => {
      const medal = ["1st", "2nd", "3rd", "4th", "5th"][i];
      const mark  = p.finished ? "✓" : p.eliminated ? "✗" : "";
      return `${medal} ${p.name.substring(0, 8)}${mark}`;
    });
    this.standings.setText(standingLines.join("\n"));

    // Minimap dots
    this.dotPool.forEach((d) => d.setVisible(false));

    const LEVEL_W = 280 * 32;
    const mapW    = 800;
    const mapY    = 576 - 12 + 6;  // środek paska

    let di = 0;
    state.players.forEach((p) => {
      const mapX = (p.x / LEVEL_W) * mapW;
      let dot    = this.dotPool[di];
      if (!dot) {
        dot = this.scene.add.arc(0, 0, 4, 0, 360, false, 0xffffff)
          .setScrollFactor(0)
          .setDepth(103);
        this.dotPool.push(dot);
      }
      dot.setPosition(mapX, mapY)
         .setFillStyle(
           Phaser.Display.Color.HexStringToColor(p.color).color
         )
         .setVisible(true);
      di++;
    });

    // Flaga mety
    const flagX = (this.finishX / LEVEL_W) * mapW;
    this.finishFlag.setPosition(flagX, 576 - 12);
  }
}
```

---

## Countdown overlay

Odliczanie 3-2-1-GO jest renderowane przez GameScene na podstawie `state.countdown`:

```typescript
// W GameScene.syncState lub GameScene.update:
if (state.phase === "countdown" && state.countdown > 0) {
  this.showCountdown(state.countdown);
} else if (state.phase === "racing" && this.countdownText) {
  this.showCountdown(0);  // "GO!"
}

private showCountdown(n: number): void {
  if (!this.countdownText) {
    this.countdownText = this.add.text(400, 250, "", {
      fontSize: "96px", color: "#fff",
      stroke: "#000", strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200);
  }
  this.countdownText.setText(n > 0 ? String(n) : "GO!");
  if (n === 0) {
    this.time.delayedCall(700, () => this.countdownText?.setVisible(false));
  }
}
```

---

## Uwagi

- `HUD.update()` jest wywoływane z `GameScene.update()` co ramkę (60fps) — metoda jest lekka.
- Dots na minimapie są poolowane — nie tworzymy nowych obiektów co ramkę.
- `standings` pokazuje faktyczną kolejność w wyścigu (na podstawie X pozycji dla graczy wciąż grających, z finishers na górze).
- `setScrollFactor(0)` sprawia że HUD jest przyklejony do ekranu, nie przewija się z kamerą.
