import type { IPlayerState } from "@shared/types";

export class PlayerSprite {
  sprite: Phaser.GameObjects.Container;
  nameLabel: Phaser.GameObjects.Text;
  ghostMode: boolean = false;
  private lastState: Partial<IPlayerState> = {};
  private animationTime: number = 0;

  constructor(
    private scene: Phaser.Scene,
    private player: IPlayerState,
  ) {
    const hasSheet = scene.textures.exists("player");

    if (hasSheet) {
      // Use sprite sheet if available
      this.sprite = scene.add.container(player.x + 12, player.y + 20);
      const spriteObj = scene.add.sprite(0, 0, "player");
      this.sprite.add(spriteObj);
      this.createAnimations(scene);
    } else {
      // Create stick figure container
      this.sprite = scene.add.container(player.x + 12, player.y + 20);
      this.drawStickFigure(player.color);
    }

    this.nameLabel = scene.add
      .text(player.x, player.y - 50, player.name, {
        fontSize: "11px",
        color: player.color,
        fontFamily: "monospace",
        stroke: "#000",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1);
  }

  private drawStickFigure(color: string): void {
    const colorValue = Phaser.Display.Color.HexStringToColor(color).color;

    // Head (circle)
    const head = this.scene.add.circle(0, -14, 6, colorValue);
    this.sprite.add(head);

    // Body (line)
    const body = this.scene.add.line(0, 0, 0, -8, 0, 4, colorValue);
    (body as any).setLineWidth(2);
    this.sprite.add(body);

    // Left arm
    const leftArm = this.scene.add.line(0, 0, -3, -4, -8, 0, colorValue);
    (leftArm as any).setLineWidth(2);
    leftArm.setName("leftArm");
    this.sprite.add(leftArm);

    // Right arm
    const rightArm = this.scene.add.line(0, 0, 3, -4, 8, 0, colorValue);
    (rightArm as any).setLineWidth(2);
    rightArm.setName("rightArm");
    this.sprite.add(rightArm);

    // Left leg
    const leftLeg = this.scene.add.line(0, 0, -3, 4, -6, 20, colorValue);
    (leftLeg as any).setLineWidth(2);
    leftLeg.setName("leftLeg");
    this.sprite.add(leftLeg);

    // Right leg
    const rightLeg = this.scene.add.line(0, 0, 3, 4, 6, 20, colorValue);
    (rightLeg as any).setLineWidth(2);
    rightLeg.setName("rightLeg");
    this.sprite.add(rightLeg);
  }

  private createAnimations(scene: Phaser.Scene): void {
    const key = `player_${this.player.id}`;
    if (!scene.anims.exists(`${key}_idle`)) {
      scene.anims.create({
        key: `${key}_idle`,
        frames: [{ key: "player", frame: 0 }],
        frameRate: 4,
        repeat: -1,
      });
      scene.anims.create({
        key: `${key}_run`,
        frames: scene.anims.generateFrameNumbers("player", {
          start: 1,
          end: 4,
        }),
        frameRate: 12,
        repeat: -1,
      });
      scene.anims.create({
        key: `${key}_jump`,
        frames: [{ key: "player", frame: 5 }],
        frameRate: 1,
        repeat: 0,
      });
      scene.anims.create({
        key: `${key}_fall`,
        frames: [{ key: "player", frame: 6 }],
        frameRate: 1,
        repeat: 0,
      });
      scene.anims.create({
        key: `${key}_die`,
        frames: scene.anims.generateFrameNumbers("player", {
          start: 7,
          end: 9,
        }),
        frameRate: 8,
        repeat: 0,
      });
    }
  }

  update(x: number, y: number, state: IPlayerState): void {
    this.sprite.setPosition(x + 12, y + 20);
    this.nameLabel.setPosition(x + 12, y - 10);

    // Check if it's a sprite sheet
    if (
      this.sprite.list.length > 0 &&
      this.sprite.list[0] instanceof Phaser.GameObjects.Sprite
    ) {
      const spriteObj = this.sprite.list[0] as Phaser.GameObjects.Sprite;
      spriteObj.setTint(
        Phaser.Display.Color.HexStringToColor(state.color).color,
      );
      spriteObj.setFlipX(!state.facingRight);

      if (state.eliminated) {
        spriteObj.play(`player_${state.id}_die`, true);
      } else if (!state.grounded) {
        spriteObj.play(
          state.vy < 0 ? `player_${state.id}_jump` : `player_${state.id}_fall`,
          true,
        );
      } else if (state.vx !== 0) {
        spriteObj.play(`player_${state.id}_run`, true);
      } else {
        spriteObj.play(`player_${state.id}_idle`, true);
      }
    } else {
      // Stick figure animation
      this.animationTime += this.scene.game.loop.delta;
      this.updateStickFigureAnimation(state);
    }

    if (this.ghostMode) {
      this.sprite.setAlpha(0.35);
    }
  }

  private updateStickFigureAnimation(state: IPlayerState): void {
    const leftArm = this.sprite.getByName("leftArm") as Phaser.GameObjects.Line;
    const rightArm = this.sprite.getByName(
      "rightArm",
    ) as Phaser.GameObjects.Line;
    const leftLeg = this.sprite.getByName("leftLeg") as Phaser.GameObjects.Line;
    const rightLeg = this.sprite.getByName(
      "rightLeg",
    ) as Phaser.GameObjects.Line;

    if (!leftArm || !rightArm || !leftLeg || !rightLeg) return;

    const flip = state.facingRight ? 1 : -1;

    if (!state.grounded) {
      // Jumping/falling: arms and legs spread out
      leftArm.setTo(-3, -4, -10, -4);
      rightArm.setTo(3, -4, 10, -4);
      leftLeg.setTo(-3, 4, -6, 22);
      rightLeg.setTo(3, 4, 6, 22);
    } else if (state.vx !== 0) {
      // Running: animate legs and arms
      const runCycle = (this.animationTime % 400) / 400;
      const legSwing = Math.sin(runCycle * Math.PI * 2) * 8;
      const armSwing = Math.sin(runCycle * Math.PI * 2) * 6;

      leftArm.setTo(
        -3,
        -4,
        (-8 + armSwing) * flip,
        (-2 + armSwing * 0.5) * flip,
      );
      rightArm.setTo(
        3,
        -4,
        (8 - armSwing) * flip,
        (-2 - armSwing * 0.5) * flip,
      );
      leftLeg.setTo(-3, 4, (-6 + legSwing) * flip, 20);
      rightLeg.setTo(3, 4, (6 - legSwing) * flip, 20);
    } else {
      // Idle: resting position
      leftArm.setTo(-3, -4, -8, 0);
      rightArm.setTo(3, -4, 8, 0);
      leftLeg.setTo(-3, 4, -6, 20);
      rightLeg.setTo(3, 4, 6, 20);
    }

    // Mirror for left-facing
    if (!state.facingRight) {
      this.sprite.setScale(-1, 1);
    } else {
      this.sprite.setScale(1, 1);
    }
  }

  setGhostMode(): void {
    this.ghostMode = true;
    this.sprite.setAlpha(0.35);
    // Zanikanie
    this.scene.tweens.add({
      targets: [this.sprite, this.nameLabel],
      alpha: 0.35,
      duration: 500,
    });
  }

  destroy(): void {
    this.sprite.destroy();
    this.nameLabel.destroy();
  }
}
