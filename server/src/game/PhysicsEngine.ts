import { CONFIG, LEVEL_HEIGHT_PX } from "../config";
import { Tile } from "@shared/types";
import { GameState, PlayerState } from "../state/GameState";
import { getTileAt } from "./tileUtils";

export interface IGameRoomCallbacks {
  finishPlayer(playerId: string):    void;
  eliminatePlayer(playerId: string): void;
}

function aabbOverlap(
  ax: number, ay: number, aw: number, ah: number,  // player
  bx: number, by: number, bw: number, bh: number,  // tile
): { overlapX: number; overlapY: number } | null {
  const ox = (ax + aw / 2) - (bx + bw / 2);
  const oy = (ay + ah / 2) - (by + bh / 2);
  const hw = (aw + bw) / 2;
  const hh = (ah + bh) / 2;
  if (Math.abs(ox) >= hw || Math.abs(oy) >= hh) return null;
  return { overlapX: hw - Math.abs(ox), overlapY: hh - Math.abs(oy) };
}

function loseLife(player: PlayerState, room: IGameRoomCallbacks): void {
  player.lives--;
  if (player.lives <= 0) {
    room.eliminatePlayer(player.id);
  } else {
    // Respawn at checkpoint
    player.x        = player.checkpointX;
    player.y        = (CONFIG.LEVEL_HEIGHT_TILES - 3) * CONFIG.TILE_SIZE;
    player.vy       = 0;
    player.vx       = 0;
    player.grounded = false;
  }
}

interface ResolveResult {
  x:        number;
  y:        number;
  vy:       number;
  vx:       number;
  grounded: boolean;
}

function resolveCollisions(
  player: PlayerState,
  newX:   number,
  newY:   number,
  tiles:  number[],
): ResolveResult {
  const TS      = CONFIG.TILE_SIZE;
  const PW      = CONFIG.PLAYER_W;
  const PH      = CONFIG.PLAYER_H;

  let x        = newX;
  let y        = newY;
  let vy       = player.vy;
  let vx       = player.vx;
  let grounded = false;

  // Gather tiles in bounding box (±1 tile margin)
  const colMin = Math.floor(x / TS) - 1;
  const colMax = Math.floor((x + PW) / TS) + 1;
  const rowMin = Math.floor(y / TS) - 1;
  const rowMax = Math.floor((y + PH) / TS) + 1;

  for (let row = rowMin; row <= rowMax; row++) {
    for (let col = colMin; col <= colMax; col++) {
      const tile = getTileAt(tiles, col, row);

      if (tile === Tile.Platform) {
        // One-way: only collide from above
        // Player must be falling and was above the platform top in previous frame
        const tileTop = row * TS;
        if (vy > 0 && player.prevY + PH <= tileTop + 1) {
          const overlap = aabbOverlap(x, y, PW, PH, col * TS, tileTop, TS, TS);
          if (overlap) {
            // Push player up to stand on platform
            y        = tileTop - PH;
            vy       = 0;
            grounded = true;
          }
        }
      } else if (tile === Tile.Ground) {
        const tileX = col * TS;
        const tileY = row * TS;
        const overlap = aabbOverlap(x, y, PW, PH, tileX, tileY, TS, TS);
        if (overlap) {
          // Resolve along axis with smaller penetration
          if (overlap.overlapX < overlap.overlapY) {
            // Push horizontally
            const playerCenterX = x + PW / 2;
            const tileCenterX   = tileX + TS / 2;
            if (playerCenterX < tileCenterX) {
              x -= overlap.overlapX;
            } else {
              x += overlap.overlapX;
            }
            vx = 0;
          } else {
            // Push vertically
            const playerCenterY = y + PH / 2;
            const tileCenterY   = tileY + TS / 2;
            if (playerCenterY < tileCenterY) {
              // Player above tile — push up
              y        -= overlap.overlapY;
              vy       = 0;
              grounded = true;
            } else {
              // Player below tile — push down (hit ceiling)
              y  += overlap.overlapY;
              vy = 0;
            }
          }
        }
      }
    }
  }

  return { x, y, vy, vx, grounded };
}

export class PhysicsEngine {
  static tick(
    state:   GameState,
    tiles:   number[],
    finishX: number,
    dt:      number,
    room:    IGameRoomCallbacks,
  ): void {
    const {
      GRAVITY, JUMP_VELOCITY, MOVE_SPEED,
      PLAYER_W, PLAYER_H,
      ENEMY_W, ENEMY_H,
    } = CONFIG;

    state.players.forEach((player) => {
      if (player.eliminated || player.finished) return;

      // 1. Read input
      const input = player.lastInput;

      // 2. Horizontal velocity
      player.vx = input.left ? -MOVE_SPEED : input.right ? MOVE_SPEED : 0;
      if (input.left)  player.facingRight = false;
      if (input.right) player.facingRight = true;

      // 3. Jump if grounded (applied before gravity so gravity accumulates correctly)
      if (input.jump && player.grounded) {
        player.vy       = JUMP_VELOCITY;
        player.grounded = false;
      }

      // 4. Gravity
      player.vy += GRAVITY * dt;

      // 5. Calculate new position
      const newX = player.x + player.vx * dt;
      const newY = player.y + player.vy * dt;

      // 6. Resolve tile collisions
      const resolved = resolveCollisions(player, newX, newY, tiles);

      // 7. Save prevY BEFORE updating player.y (used for one-way platform detection)
      player.prevY = player.y;

      // Update position and velocities
      player.x        = resolved.x;
      player.y        = resolved.y;
      player.vy       = resolved.vy;
      player.vx       = resolved.vx;
      player.grounded = resolved.grounded;

      // 8. Update checkpoint every 2s if grounded
      const now = Date.now();
      if (player.grounded && now - player.lastCheckpoint >= CONFIG.CHECKPOINT_INTERVAL_MS) {
        player.checkpointX    = player.x;
        player.lastCheckpoint = now;
      }

      // 9. Check for fall
      if (player.y > LEVEL_HEIGHT_PX + 64) {
        loseLife(player, room);
        return;
      }

      // 10. Check enemy AABB overlap
      for (const enemy of state.enemies) {
        if (aabbOverlap(
          player.x, player.y, PLAYER_W, PLAYER_H,
          enemy.x - ENEMY_W / 2, enemy.y - ENEMY_H / 2, ENEMY_W, ENEMY_H,
        )) {
          loseLife(player, room);
          return;  // only 1 life lost per tick
        }
      }

      // 11. Check finish line
      const playerCenterX = player.x + PLAYER_W / 2;
      if (playerCenterX >= finishX) {
        room.finishPlayer(player.id);
      }
    });
  }
}
