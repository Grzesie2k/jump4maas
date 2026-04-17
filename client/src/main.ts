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
  backgroundColor: "#5C94FC",
  scene:      [BootScene, GameScene, ResultsScene],
  physics:    { default: "arcade", arcade: { debug: false } },
};

const game = new Phaser.Game(config);
(window as any).__phaserGame = game;

const lobbyUI = new LobbyUI();
lobbyUI.init();
(window as any).__lobbyUI = lobbyUI;
