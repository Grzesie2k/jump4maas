import { ArraySchema } from "@colyseus/schema";
import { CONFIG } from "../config";
import { Tile } from "@shared/types";
import type { EnemySpawn } from "@shared/types";
import { EnemyState } from "../state/GameState";
import { getTileAt, isSolid } from "./tileUtils";

function getPatrolRange(
  spawnX: number,
  spawnY: number,
  tiles:  number[],
): { minX: number; maxX: number } {
  const TS  = CONFIG.TILE_SIZE;
  const col = Math.floor(spawnX / TS);
  const row = Math.floor(spawnY / TS) + 1;  // row directly below the enemy

  // Walk left
  let left = col;
  while (left > 0 && isSolid(getTileAt(tiles, left - 1, row))) left--;

  // Walk right
  let right = col;
  const W   = CONFIG.LEVEL_WIDTH_TILES;
  while (right < W - 1 && isSolid(getTileAt(tiles, right + 1, row))) right++;

  // Return tile centers (enemy oscillates between centers of boundary tiles)
  return {
    minX: left  * TS + TS / 2,
    maxX: right * TS + TS / 2,
  };
}

function isWall(x: number, y: number, facingRight: boolean, tiles: number[]): boolean {
  const TS    = CONFIG.TILE_SIZE;
  const halfW = CONFIG.ENEMY_W / 2;
  const checkX = facingRight ? x + halfW : x - halfW;
  const col    = Math.floor(checkX / TS);
  const row    = Math.floor(y / TS);
  return getTileAt(tiles, col, row) === Tile.Ground;
}

export class EnemyAI {
  /** Called once per race start by GameRoom */
  static spawnEnemies(spawns: EnemySpawn[], enemies: ArraySchema<EnemyState>, tiles: number[] = []): void {
    spawns.forEach((spawn, i) => {
      const enemy        = new EnemyState();
      enemy.id           = i;
      enemy.x            = spawn.x;
      enemy.y            = spawn.y;
      enemy.facingRight  = true;

      // Determine patrol range: tiles directly beneath the enemy
      // MapGenerator guarantees spawn is on a solid tile — patrol covers the whole segment
      const { minX, maxX } = getPatrolRange(spawn.x, spawn.y, tiles);
      enemy.minX = minX;
      enemy.maxX = maxX;

      enemies.push(enemy);
    });
  }

  /** Called every tick by GameRoom, after PhysicsEngine.tick */
  static tick(enemies: ArraySchema<EnemyState>, tiles: number[], dt: number): void {
    for (const enemy of enemies) {
      const speed = CONFIG.ENEMY_SPEED;
      const move  = enemy.facingRight ? speed * dt : -speed * dt;

      const nextX = enemy.x + move;

      // Reverse at segment edge or wall
      const hitWall     = isWall(nextX, enemy.y, enemy.facingRight, tiles);
      const offPlatform = nextX < enemy.minX || nextX > enemy.maxX;

      if (hitWall || offPlatform) {
        enemy.facingRight = !enemy.facingRight;
      } else {
        enemy.x = nextX;
      }
    }
  }
}
