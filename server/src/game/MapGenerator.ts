import { CONFIG } from "../config";
import { Tile } from "@shared/types";
import type { EnemySpawn } from "@shared/types";

export interface MapLayout {
  seed:        number;
  tiles:       number[];           // flat row-major, length = WIDTH * HEIGHT, values from Tile enum
  enemySpawns: EnemySpawn[];       // px, center of enemy sprite
  finishX:     number;             // px, left edge of finish line (= 271 * TILE_SIZE)
}

function mulberry32(seed: number) {
  return function(): number {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function isNearGap(col: number, row: number, tiles: number[], margin: number): boolean {
  const W = CONFIG.LEVEL_WIDTH_TILES;
  for (let dc = -margin; dc <= margin; dc++) {
    if (dc === 0) continue;
    const c = col + dc;
    if (c < 0 || c >= W) continue;
    if (tiles[row * W + c] === Tile.Empty) return true;
  }
  return false;
}

export class MapGenerator {
  static generate(seed: number): MapLayout {
    const rng  = mulberry32(seed);
    const W    = CONFIG.LEVEL_WIDTH_TILES;   // 280
    const H    = CONFIG.LEVEL_HEIGHT_TILES;  // 18
    const TS   = CONFIG.TILE_SIZE;           // 32

    // Step 1 — Initialize empty tiles array
    const tiles = new Array(W * H).fill(Tile.Empty);

    // Step 2 — Start zone (cols 0-9) and finish zone (cols 270-279), rows 16-17
    for (const row of [16, 17]) {
      for (let col = 0; col <= 9; col++) {
        tiles[row * W + col] = Tile.Ground;
      }
      for (let col = 270; col <= 279; col++) {
        tiles[row * W + col] = Tile.Ground;
      }
    }

    // Step 3 — Middle ground segments and gaps (cols 10-269)
    // Collect segments for platform generation
    const segments: Array<{ segStart: number; segLen: number }> = [];

    let col = 10;
    let lastGapEnd = -999;

    while (col < 270) {
      // Ground segment
      let segLen = Math.floor(rng() * 11) + 4;   // 4..14
      segLen = Math.min(segLen, 270 - col);

      for (let c = col; c < col + segLen; c++) {
        for (const row of [16, 17]) {
          tiles[row * W + c] = Tile.Ground;
        }
      }

      const segStart = col;
      segments.push({ segStart, segLen });
      col += segLen;

      if (col >= 270) break;

      // Gap
      let gapLen = Math.floor(rng() * 4) + 2;   // 2..5
      gapLen = Math.min(gapLen, 270 - col, 5);   // max 5 — always jumpable

      // Constraint: no two gaps within 3 tiles of each other
      if (col - lastGapEnd < 3) {
        gapLen = 0;  // skip gap, continue with next segment
      }

      if (gapLen > 0) {
        lastGapEnd = col + gapLen;
      }

      col += gapLen;
    }

    // Step 4 — Floating platforms on segments longer than 6 tiles (60% chance)
    for (const { segStart, segLen } of segments) {
      if (segLen > 6 && rng() < 0.60) {
        const numPlatforms = rng() < 0.5 ? 1 : 2;
        for (let p = 0; p < numPlatforms; p++) {
          const platLen     = Math.floor(rng() * 5) + 3;            // 3..7
          const heightAbove = Math.floor(rng() * 3) + 3;             // 3..5 tiles above row 16
          const platRow     = 16 - heightAbove;                       // e.g. row 13 if heightAbove=3
          let platCol       = segStart + Math.floor(rng() * Math.max(1, segLen - platLen));
          // Clamp to segment bounds
          platCol = Math.max(segStart, Math.min(platCol, segStart + segLen - platLen));

          for (let c = platCol; c < platCol + platLen; c++) {
            tiles[platRow * W + c] = Tile.Platform;
          }
        }
      }
    }

    // Step 5 — Finish line (column 271, all rows)
    for (let row = 0; row < H; row++) {
      tiles[row * W + 271] = Tile.Finish;
    }
    const finishX = 271 * TS;

    // Step 6 — Enemies
    const enemySpawns: EnemySpawn[] = [];
    let tilesSinceLastEnemy = 0;

    // Check ground tiles (row 16) and platform tiles (rows 0..15)
    for (let row = 0; row < H; row++) {
      const isGroundRow    = row === 16;
      const isPlatformRow  = row >= 0 && row <= 15;
      if (!isGroundRow && !isPlatformRow) continue;

      for (let c = 0; c < W; c++) {
        const tileVal = tiles[row * W + c];
        const isTileGround    = isGroundRow && tileVal === Tile.Ground;
        const isTilePlatform  = isPlatformRow && tileVal === Tile.Platform;

        if (!isTileGround && !isTilePlatform) continue;

        tilesSinceLastEnemy++;

        if (tilesSinceLastEnemy >= 15 && rng() < (tilesSinceLastEnemy / 20)) {
          // Not in start zone
          if (c < 15) continue;

          // Not near gap (check same row for ground, same row for platforms)
          if (isNearGap(c, row, tiles, 3)) continue;

          const spawnX = c * TS + TS / 2;
          const spawnY = row * TS - CONFIG.ENEMY_H / 2;

          enemySpawns.push({ x: spawnX, y: spawnY });
          tilesSinceLastEnemy = 0;
        }
      }
    }

    // Step 7 — Decorations in rows 0-2
    for (const row of [0, 1, 2]) {
      for (let c = 0; c < W; c++) {
        if (rng() < 0.04) {
          tiles[row * W + c] = Tile.Decoration;
        }
      }
    }

    return {
      seed,
      tiles,
      enemySpawns,
      finishX,
    };
  }
}
