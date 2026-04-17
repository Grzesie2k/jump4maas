import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() { super("BootScene"); }

  preload(): void {
    // Próba załadowania prawdziwych assetów (mogą nie istnieć przy pierwszym uruchomieniu)
    this.load.on("loaderror", (file: { key: string }) => {
      console.warn(`Asset not found: ${file.key} — placeholder will be used`);
    });

    this.load.image("tiles",   "assets/tiles/tileset.png");
    this.load.spritesheet("player", "assets/player/player.png",
      { frameWidth: 48, frameHeight: 48 });
    this.load.spritesheet("enemy",  "assets/enemy/enemy.png",
      { frameWidth: 32, frameHeight: 32 });
  }

  create(): void {
    // Nie startuj gry automatycznie — GameScene jest uruchamiana przez ColyseusClient.onRaceStart
    // BootScene od razu idzie uśpiony; czekamy na event z LobbyUI
  }
}
