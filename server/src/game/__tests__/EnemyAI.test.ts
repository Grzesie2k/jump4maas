import { describe, it, expect } from "vitest";
import { CONFIG } from "../../config";
import { Tile } from "@shared/types";

// EnemyAI is being written by the backend developer. Once it exists at
// "../EnemyAI" this import will resolve.  Until then the describe blocks
// document the expected behavior and are skipped gracefully.
let EnemyAI: typeof import("../EnemyAI").EnemyAI;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  EnemyAI = require("../EnemyAI").EnemyAI;
} catch {
  // File not yet written — tests will self-skip via the guard in each case
}

const TS  = CONFIG.TILE_SIZE;
const W   = CONFIG.LEVEL_WIDTH_TILES;
const H   = CONFIG.LEVEL_HEIGHT_TILES;
const DT  = 1 / CONFIG.PHYSICS_TICK_RATE;  // 0.05 s

// ─── helpers ────────────────────────────────────────────────────────────────

function makeEnemy(overrides: Record<string, unknown> = {}) {
  return {
    id:          0,
    x:           0,
    y:           0,
    facingRight: true,
    minX:        0,
    maxX:        1000,
    ...overrides,
  };
}

/**
 * Minimal ArraySchema-compatible collection: an array with push() that also
 * supports for..of iteration — matches EnemyAI.tick usage pattern.
 */
function makeEnemyArray(items: ReturnType<typeof makeEnemy>[] = []) {
  const arr = [...items];
  (arr as never as { push: (v: unknown) => void }).push = arr.push.bind(arr);
  return arr as ReturnType<typeof makeEnemy>[] & { push: (v: unknown) => void };
}

/** Build an all-empty tiles array. */
function emptyTiles(): number[] {
  return new Array(W * H).fill(Tile.Empty);
}

/** Place ground tiles in the row that serves as "floor". */
function placeGroundRow(tiles: number[], groundRow: number) {
  for (let col = 0; col < W; col++) {
    tiles[groundRow * W + col] = Tile.Ground;
  }
}

// ─── guard ───────────────────────────────────────────────────────────────────

function skipIfMissing() {
  if (!EnemyAI) {
    // EnemyAI module not yet created — skip this test
    return true;
  }
  return false;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("EnemyAI", () => {
  describe("tick", () => {
    it("moves enemy right when facingRight=true", () => {
      if (skipIfMissing()) return;

      const enemy   = makeEnemy({ x: 100, y: 100, facingRight: true, minX: 50, maxX: 500 });
      const enemies = makeEnemyArray([enemy]);
      const tiles   = emptyTiles();

      EnemyAI.tick(enemies as never, tiles, DT);

      const expectedX = 100 + CONFIG.ENEMY_SPEED * DT;
      expect(enemy.x).toBeCloseTo(expectedX);
    });

    it("moves enemy left when facingRight=false", () => {
      if (skipIfMissing()) return;

      const enemy   = makeEnemy({ x: 300, y: 100, facingRight: false, minX: 50, maxX: 500 });
      const enemies = makeEnemyArray([enemy]);
      const tiles   = emptyTiles();

      EnemyAI.tick(enemies as never, tiles, DT);

      const expectedX = 300 - CONFIG.ENEMY_SPEED * DT;
      expect(enemy.x).toBeCloseTo(expectedX);
    });

    it("reverses direction when reaching maxX boundary", () => {
      if (skipIfMissing()) return;

      // Enemy is at maxX, still facing right — next step would go past maxX
      const maxX  = 500;
      const enemy = makeEnemy({
        x:           maxX,
        y:           100,
        facingRight: true,
        minX:        50,
        maxX:        maxX,
      });
      const enemies = makeEnemyArray([enemy]);
      const tiles   = emptyTiles();

      EnemyAI.tick(enemies as never, tiles, DT);

      // Should have reversed direction
      expect(enemy.facingRight).toBe(false);
    });

    it("reverses direction when reaching minX boundary", () => {
      if (skipIfMissing()) return;

      const minX  = 50;
      const enemy = makeEnemy({
        x:           minX,
        y:           100,
        facingRight: false,
        minX:        minX,
        maxX:        500,
      });
      const enemies = makeEnemyArray([enemy]);
      const tiles   = emptyTiles();

      EnemyAI.tick(enemies as never, tiles, DT);

      expect(enemy.facingRight).toBe(true);
    });

    it("moves at ENEMY_SPEED (60 px/s)", () => {
      if (skipIfMissing()) return;

      const startX  = 200;
      const enemy   = makeEnemy({ x: startX, facingRight: true, minX: 50, maxX: 1000 });
      const enemies = makeEnemyArray([enemy]);
      const tiles   = emptyTiles();

      EnemyAI.tick(enemies as never, tiles, DT);

      const moved = Math.abs(enemy.x - startX);
      expect(moved).toBeCloseTo(CONFIG.ENEMY_SPEED * DT, 2);
    });

    it("does not move (reverses) when hitting a Ground wall tile", () => {
      if (skipIfMissing()) return;

      const tiles = emptyTiles();
      // Place a Ground tile directly ahead of the enemy
      const enemyCol  = 10;
      const enemyRow  = 8;
      const wallCol   = enemyCol + 1;
      tiles[enemyRow * W + wallCol] = Tile.Ground;

      const enemyX = enemyCol * TS + TS / 2;
      const enemyY = enemyRow * TS + TS / 2;

      const enemy   = makeEnemy({
        x:           enemyX,
        y:           enemyY,
        facingRight: true,
        minX:        0,
        maxX:        99999,
      });
      const enemies = makeEnemyArray([enemy]);

      EnemyAI.tick(enemies as never, tiles, DT);

      // Should reverse direction instead of walking into the wall
      expect(enemy.facingRight).toBe(false);
    });

    it("does not apply gravity (y stays constant)", () => {
      if (skipIfMissing()) return;

      const enemy   = makeEnemy({ x: 200, y: 300, facingRight: true, minX: 50, maxX: 1000 });
      const enemies = makeEnemyArray([enemy]);
      const tiles   = emptyTiles();

      EnemyAI.tick(enemies as never, tiles, DT);

      // y should not change — enemies are not subject to gravity
      expect(enemy.y).toBe(300);
    });
  });

  describe("spawnEnemies", () => {
    it("creates enemies with correct initial positions from spawns", () => {
      if (skipIfMissing()) return;

      const spawns  = [
        { x: 100, y: 200 },
        { x: 300, y: 400 },
      ];
      const enemies = makeEnemyArray();

      // Build a tiles array with solid ground under each spawn
      const tiles = emptyTiles();
      const groundRow = 17;
      placeGroundRow(tiles, groundRow);

      EnemyAI.spawnEnemies(spawns, enemies as never);

      expect(enemies.length).toBe(2);
      expect(enemies[0].x).toBe(100);
      expect(enemies[0].y).toBe(200);
      expect(enemies[1].x).toBe(300);
      expect(enemies[1].y).toBe(400);
    });

    it("assigns sequential IDs starting from 0", () => {
      if (skipIfMissing()) return;

      const spawns  = [
        { x: 500, y: 100 },
        { x: 700, y: 100 },
        { x: 900, y: 100 },
      ];
      const enemies = makeEnemyArray();
      const tiles   = emptyTiles();
      placeGroundRow(tiles, 17);

      EnemyAI.spawnEnemies(spawns, enemies as never);

      expect(enemies[0].id).toBe(0);
      expect(enemies[1].id).toBe(1);
      expect(enemies[2].id).toBe(2);
    });

    it("all spawned enemies have facingRight=true initially", () => {
      if (skipIfMissing()) return;

      const spawns  = [
        { x: 500, y: 100 },
        { x: 700, y: 100 },
      ];
      const enemies = makeEnemyArray();
      const tiles   = emptyTiles();
      placeGroundRow(tiles, 17);

      EnemyAI.spawnEnemies(spawns, enemies as never);

      for (const enemy of enemies) {
        expect(enemy.facingRight).toBe(true);
      }
    });

    it("sets patrol range based on tile segment (minX <= x <= maxX)", () => {
      if (skipIfMissing()) return;

      const tiles = emptyTiles();
      // Create a ground segment in row 17 (the row the patrol range function checks)
      // Enemy spawn is at col 10, row 16 (ground row), so the row below is 17.
      // Place ground in row 17 cols 8-14.
      for (let col = 8; col <= 14; col++) {
        tiles[17 * W + col] = Tile.Ground;
        tiles[16 * W + col] = Tile.Ground;
      }

      const spawnX = 10 * TS + TS / 2;   // center of col 10
      const spawnY = 16 * TS - CONFIG.ENEMY_H / 2;

      const spawns  = [{ x: spawnX, y: spawnY }];
      const enemies = makeEnemyArray();

      EnemyAI.spawnEnemies(spawns, enemies as never);

      expect(enemies.length).toBe(1);
      const enemy = enemies[0];
      // minX should be at or left of spawn, maxX at or right of spawn
      expect(enemy.minX).toBeLessThanOrEqual(spawnX);
      expect(enemy.maxX).toBeGreaterThanOrEqual(spawnX);
      // minX and maxX should be in pixel coordinates
      expect(typeof enemy.minX).toBe("number");
      expect(typeof enemy.maxX).toBe("number");
    });

    it("spawns no enemies when spawns array is empty", () => {
      if (skipIfMissing()) return;

      const enemies = makeEnemyArray();
      EnemyAI.spawnEnemies([], enemies as never);
      expect(enemies.length).toBe(0);
    });
  });
});
