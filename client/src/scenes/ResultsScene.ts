import Phaser from "phaser";
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
      delay:    1000,
      repeat:   7,
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
