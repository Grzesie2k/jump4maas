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
      scene.anims.create({ key: `${key}_idle`, frames: [{ key: "player", frame: 0 }], frameRate: 4,  repeat: -1 });
      scene.anims.create({ key: `${key}_run`,  frames: scene.anims.generateFrameNumbers("player", { start: 1, end: 4 }), frameRate: 12, repeat: -1 });
      scene.anims.create({ key: `${key}_jump`, frames: [{ key: "player", frame: 5 }], frameRate: 1,  repeat: 0  });
      scene.anims.create({ key: `${key}_fall`, frames: [{ key: "player", frame: 6 }], frameRate: 1,  repeat: 0  });
      scene.anims.create({ key: `${key}_die`,  frames: scene.anims.generateFrameNumbers("player", { start: 7, end: 9 }), frameRate: 8,  repeat: 0  });
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
