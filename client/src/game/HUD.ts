import type { IGameState } from "@shared/types";
import { ColyseusClient }  from "../network/ColyseusClient";

const HEART_FULL = "♥";

export class HUD {
  private topBar:     Phaser.GameObjects.Rectangle;
  private heartsText: Phaser.GameObjects.Text;
  private nameText:   Phaser.GameObjects.Text;
  private standings:  Phaser.GameObjects.Text;
  private minimapBg:  Phaser.GameObjects.Rectangle;
  private dotPool:    Phaser.GameObjects.Arc[] = [];
  private finishFlag: Phaser.GameObjects.Text;

  constructor(
    private scene:   Phaser.Scene,
    private finishX: number, // px, do obliczeń minimapy
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
      const hearts = `${HEART_FULL} ×${myState.lives}`;
      this.heartsText.setText(hearts);
      this.nameText.setText(myState.name);
    }

    // Standings (top right)
    const sorted = [...state.players.values()]
      .filter((_p) => true) // wszyscy
      .sort((a, b) => {
        if (a.finished && !b.finished) return -1;
        if (!a.finished && b.finished) return 1;
        if (a.eliminated && !b.eliminated) return 1;
        if (!a.eliminated && b.eliminated) return -1;
        return b.x - a.x; // kto dalej
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
    const mapY    = 576 - 12 + 6; // środek paska

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
