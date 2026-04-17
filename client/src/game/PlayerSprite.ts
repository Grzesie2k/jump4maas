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
      this.sprite = scene.add.container(player.x, player.y);
      const spriteObj = scene.add.sprite(0, 0, "player");
      this.sprite.add(spriteObj);
      this.createAnimations(scene);
    } else {
      // Container origin = physics top-left (player.x, player.y), hitbox 24×40
      this.sprite = scene.add.container(player.x, player.y);
      this.drawStickFigure(player.color);
    }

    this.nameLabel = scene.add
      .text(player.x, player.y + 2, player.name, {
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

    // All y-coords relative to container origin (physics top-left).
    // Feet at y=40 aligns with hitbox bottom (PLAYER_H=40).
    const head = this.scene.add.circle(0, 14, 6, colorValue);
    this.sprite.add(head);

    const body = this.scene.add.line(0, 0, 0, 20, 0, 32, colorValue);
    (body as any).setLineWidth(2);
    this.sprite.add(body);

    const leftArm = this.scene.add.line(0, 0, -3, 24, -8, 28, colorValue);
    (leftArm as any).setLineWidth(2);
    leftArm.setName("leftArm");
    this.sprite.add(leftArm);

    const rightArm = this.scene.add.line(0, 0, 3, 24, 8, 28, colorValue);
    (rightArm as any).setLineWidth(2);
    rightArm.setName("rightArm");
    this.sprite.add(rightArm);

    const leftLeg = this.scene.add.line(0, 0, -3, 32, -6, 40, colorValue);
    (leftLeg as any).setLineWidth(2);
    leftLeg.setName("leftLeg");
    this.sprite.add(leftLeg);

    const rightLeg = this.scene.add.line(0, 0, 3, 32, 6, 40, colorValue);
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
        frames: scene.anims.generateFrameNumbers("player", { start: 1, end: 4 }),
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
        frames: scene.anims.generateFrameNumbers("player", { start: 7, end: 9 }),
        frameRate: 8,
        repeat: 0,
      });
    }
  }

  update(x: number, y: number, state: IPlayerState): void {
    this.sprite.setPosition(x, y);
    this.nameLabel.setPosition(x, y + 2);

    if (
      this.sprite.list.length > 0 &&
      this.sprite.list[0] instanceof Phaser.GameObjects.Sprite
    ) {
      const spriteObj = this.sprite.list[0] as Phaser.GameObjects.Sprite;
      spriteObj.setTint(Phaser.Display.Color.HexStringToColor(state.color).color);
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
      this.animationTime += this.scene.game.loop.delta;
      this.updateStickFigureAnimation(state);
    }

    if (this.ghostMode) {
      this.sprite.setAlpha(0.35);
    }
  }

  private updateStickFigureAnimation(state: IPlayerState): void {
    const leftArm  = this.sprite.getByName("leftArm")  as Phaser.GameObjects.Line;
    const rightArm = this.sprite.getByName("rightArm") as Phaser.GameObjects.Line;
    const leftLeg  = this.sprite.getByName("leftLeg")  as Phaser.GameObjects.Line;
    const rightLeg = this.sprite.getByName("rightLeg") as Phaser.GameObjects.Line;

    if (!leftArm || !rightArm || !leftLeg || !rightLeg) return;

    const flip = state.facingRight ? 1 : -1;

    if (!state.grounded) {
      leftArm.setTo(-3, 24, -10, 24);
      rightArm.setTo(3, 24, 10, 24);
      leftLeg.setTo(-3, 32, -6, 42);
      rightLeg.setTo(3, 32, 6, 42);
    } else if (state.vx !== 0) {
      const runCycle = (this.animationTime % 400) / 400;
      const legSwing = Math.sin(runCycle * Math.PI * 2) * 8;
      const armSwing = Math.sin(runCycle * Math.PI * 2) * 6;

      leftArm.setTo(-3, 24, (-8 + armSwing) * flip, 26 + armSwing * 0.5);
      rightArm.setTo(3, 24, (8 - armSwing) * flip, 26 - armSwing * 0.5);
      leftLeg.setTo(-3, 32, (-6 + legSwing) * flip, 40);
      rightLeg.setTo(3, 32, (6 - legSwing) * flip, 40);
    } else {
      leftArm.setTo(-3, 24, -8, 28);
      rightArm.setTo(3, 24, 8, 28);
      leftLeg.setTo(-3, 32, -6, 40);
      rightLeg.setTo(3, 32, 6, 40);
    }

    if (!state.facingRight) {
      this.sprite.setScale(-1, 1);
    } else {
      this.sprite.setScale(1, 1);
    }
  }

  setGhostMode(): void {
    this.ghostMode = true;
    this.sprite.setAlpha(0.35);
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
