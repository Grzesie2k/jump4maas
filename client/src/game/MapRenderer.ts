import { Tile } from "@shared/types";

const TS = 32; // TILE_SIZE

export class MapRenderer {
  static build(
    scene:  Phaser.Scene,
    tiles:  number[],
    width:  number = 280,
    height: number = 18,
  ): {
    groundGroup:   Phaser.Physics.Arcade.StaticGroup;
    platformGroup: Phaser.Physics.Arcade.StaticGroup;
    finishGroup:   Phaser.GameObjects.Group;
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
          if (hasTileset) {
            groundGroup.create(x, y, "tiles", 0);
          } else {
            const obj = createRect(scene, x, y, TS, TS, 0x8B6914);
            groundGroup.add(obj, true);
          }

        } else if (tile === Tile.Platform) {
          if (hasTileset) {
            const img = scene.add.image(x, y, "tiles", 2);
            const body = scene.physics.add.existing(img, true) as unknown as Phaser.Physics.Arcade.Image;
            (body.body as Phaser.Physics.Arcade.StaticBody).setSize(TS, 8).setOffset(0, 0);
            platformGroup.add(body);
          } else {
            const obj  = createRect(scene, x, y, TS, 10, 0xC8A86B);
            const body = scene.physics.add.existing(obj, true) as unknown as Phaser.Physics.Arcade.Image;
            (body.body as Phaser.Physics.Arcade.StaticBody).setSize(TS, 8).setOffset(0, 0);
            platformGroup.add(body);
          }

        } else if (tile === Tile.Finish) {
          if (hasTileset) {
            const obj = scene.add.image(x, y, "tiles", 3);
            finishGroup.add(obj);
          } else {
            const obj = createRect(scene, x, y, TS, TS, 0xFFFF00, 0.6);
            finishGroup.add(obj);
          }

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
  scene: Phaser.Scene,
  x:     number,
  y:     number,
  w:     number,
  h:     number,
  color: number,
  alpha: number = 1,
): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(x, y, w, h, color, alpha);
}
