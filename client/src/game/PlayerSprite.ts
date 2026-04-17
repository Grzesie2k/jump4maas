import type { IPlayerState } from "@shared/types";

export class PlayerSprite {
  sprite:    Phaser.GameObjects.Rectangle | Phaser.GameObjects.Sprite;
  head!:     Phaser.GameObjects.Arc;
  nameLabel: Phaser.GameObjects.Text;
  ghostMode: boolean = false;

  constructor(
    private scene:  Phaser.Scene,
    private player: IPlayerState,
  ) {
    const hasSheet = scene.textures.exists("player");

    if (hasSheet) {
      this.sprite = scene.add.sprite(player.x, player.y, "player");
      this.createAnimations(scene);
    } else {
      // Placeholder: kolorowy prostokąt z kółkiem
      this.sprite = scene.add.rectangle(player.x, player.y, 24, 40, 0xffffff)
        .setTint(Phaser.Display.Color.HexStringToColor(player.color).color);
      this.head = scene.add.arc(player.x, player.y - 28, 12, 0, 360, false,
        Phaser.Display.Color.HexStringToColor(player.color).color);
    }

    this.nameLabel = scene.add.text(player.x, player.y - 50, player.name, {
      fontSize:        "11px",
      color:           player.color,
      fontFamily:      "monospace",
      stroke:          "#000",
      strokeThickness: 2,
    }).setOrigin(0.5, 1);
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
    this.sprite.setPosition(x, y);
    if (this.head) this.head.setPosition(x, y - 28);
    this.nameLabel.setPosition(x, y - 44);

    if (this.sprite instanceof Phaser.GameObjects.Sprite) {
      const s = this.sprite;
      s.setTint(Phaser.Display.Color.HexStringToColor(state.color).color);
      s.setFlipX(!state.facingRight);

      if (state.eliminated) {
        s.play(`player_${state.id}_die`, true);
      } else if (!state.grounded) {
        s.play(state.vy < 0 ? `player_${state.id}_jump` : `player_${state.id}_fall`, true);
      } else if (state.vx !== 0) {
        s.play(`player_${state.id}_run`, true);
      } else {
        s.play(`player_${state.id}_idle`, true);
      }
    } else {
      (this.sprite as Phaser.GameObjects.Rectangle)
        .setTint(Phaser.Display.Color.HexStringToColor(state.color).color);
    }

    if (this.ghostMode) {
      this.sprite.setAlpha(0.35);
    }
  }

  setGhostMode(): void {
    this.ghostMode = true;
    this.sprite.setAlpha(0.35);
    // Zanikanie
    this.scene.tweens.add({
      targets:  [this.sprite, this.head, this.nameLabel].filter(Boolean),
      alpha:    0.35,
      duration: 500,
    });
  }

  destroy(): void {
    this.sprite.destroy();
    this.head?.destroy();
    this.nameLabel.destroy();
  }
}
