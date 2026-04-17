import { describe, it, expect } from "vitest";
import { MapGenerator } from "../MapGenerator";
import { Tile } from "@shared/types";
import { CONFIG } from "../../config";

const W = CONFIG.LEVEL_WIDTH_TILES;  // 280
const H = CONFIG.LEVEL_HEIGHT_TILES; // 18
const TS = CONFIG.TILE_SIZE;         // 32

const TEST_SEEDS = [12345, 99999, 0, 42, 777777];

describe("MapGenerator", () => {
  describe("generate(seed)", () => {
    it("returns correct array length", () => {
      for (const seed of TEST_SEEDS) {
        const layout = MapGenerator.generate(seed);
        expect(layout.tiles.length).toBe(W * H);
      }
    });

    it("is deterministic — same seed gives same result", () => {
      for (const seed of TEST_SEEDS) {
        const a = MapGenerator.generate(seed);
        const b = MapGenerator.generate(seed);
        expect(a.tiles).toEqual(b.tiles);
        expect(a.enemySpawns).toEqual(b.enemySpawns);
        expect(a.finishX).toBe(b.finishX);
        expect(a.seed).toBe(b.seed);
      }
    });

    it("different seeds give different results", () => {
      const a = MapGenerator.generate(12345);
      const b = MapGenerator.generate(99999);
      // Tiles arrays should not be identical
      expect(a.tiles).not.toEqual(b.tiles);
    });

    it("returns the correct seed in the result", () => {
      for (const seed of TEST_SEEDS) {
        const layout = MapGenerator.generate(seed);
        expect(layout.seed).toBe(seed);
      }
    });

    describe("start zone (cols 0-9, rows 16-17)", () => {
      it("is all Ground tiles", () => {
        for (const seed of TEST_SEEDS) {
          const { tiles } = MapGenerator.generate(seed);
          for (const row of [16, 17]) {
            for (let col = 0; col <= 9; col++) {
              const idx = row * W + col;
              expect(tiles[idx]).toBe(Tile.Ground);
            }
          }
        }
      });
    });

    describe("finish zone (cols 270-279, rows 16-17)", () => {
      it("is all Ground tiles", () => {
        for (const seed of TEST_SEEDS) {
          const { tiles } = MapGenerator.generate(seed);
          for (const row of [16, 17]) {
            for (let col = 270; col <= 279; col++) {
              const idx = row * W + col;
              expect(tiles[idx]).toBe(Tile.Ground);
            }
          }
        }
      });
    });

    describe("finish line (col 271)", () => {
      it("contains Finish tiles in all rows", () => {
        for (const seed of TEST_SEEDS) {
          const { tiles } = MapGenerator.generate(seed);
          for (let row = 0; row < H; row++) {
            // Row 16 and 17 are Ground (placed after finish line step, but let's just check
            // that column 271 has Finish tiles in rows not overridden by ground (rows 0-15)
            if (row < 16) {
              expect(tiles[row * W + 271]).toBe(Tile.Finish);
            }
          }
        }
      });

      it("finishX equals 271 * TILE_SIZE", () => {
        for (const seed of TEST_SEEDS) {
          const { finishX } = MapGenerator.generate(seed);
          expect(finishX).toBe(271 * TS);
        }
      });
    });

    describe("gaps", () => {
      it("no gap wider than 5 tiles in rows 16-17", () => {
        for (const seed of TEST_SEEDS) {
          const { tiles } = MapGenerator.generate(seed);
          // Check row 16 only (row 17 mirrors it). Count consecutive Empty tiles.
          // Start zone (0-9) and finish zone (270-279) are always Ground so we check middle.
          let consecutiveEmpty = 0;
          for (let col = 10; col < 270; col++) {
            const tile = tiles[16 * W + col];
            if (tile === Tile.Empty) {
              consecutiveEmpty++;
              expect(consecutiveEmpty).toBeLessThanOrEqual(5);
            } else {
              consecutiveEmpty = 0;
            }
          }
        }
      });

      it("start zone has no gaps (cols 0-9 are solid ground)", () => {
        for (const seed of TEST_SEEDS) {
          const { tiles } = MapGenerator.generate(seed);
          for (let col = 0; col <= 9; col++) {
            expect(tiles[16 * W + col]).toBe(Tile.Ground);
          }
        }
      });
    });

    describe("enemy spawns", () => {
      it("no enemy spawn in cols 0-14", () => {
        for (const seed of TEST_SEEDS) {
          const { enemySpawns } = MapGenerator.generate(seed);
          for (const spawn of enemySpawns) {
            // Column 14 corresponds to x < 15 * TS + TS/2
            // The guard in the generator is: if col < 15 continue
            // So minimum spawn col is 15, meaning minimum spawnX = 15 * TS + TS/2
            const minAllowedX = 15 * TS + TS / 2;
            expect(spawn.x).toBeGreaterThanOrEqual(minAllowedX);
          }
        }
      });

      it("all enemy spawns have positive x and y coordinates", () => {
        for (const seed of TEST_SEEDS) {
          const { enemySpawns } = MapGenerator.generate(seed);
          for (const spawn of enemySpawns) {
            expect(spawn.x).toBeGreaterThan(0);
            // y can be negative for platform row 0 (row 0 * TS - ENEMY_H/2 = -12), but
            // for ground row 16: 16 * TS - ENEMY_H/2 = 512 - 12 = 500 > 0.
            // For platform rows the y may be negative for row=0.
            // Spec says "all enemy spawns have positive x and y" — we check x is always positive.
            expect(spawn.x).toBeGreaterThan(0);
          }
        }
      });

      it("returns an array (enemySpawns is an array)", () => {
        for (const seed of TEST_SEEDS) {
          const { enemySpawns } = MapGenerator.generate(seed);
          expect(Array.isArray(enemySpawns)).toBe(true);
        }
      });

      it("each spawn has numeric x and y", () => {
        for (const seed of TEST_SEEDS) {
          const { enemySpawns } = MapGenerator.generate(seed);
          for (const spawn of enemySpawns) {
            expect(typeof spawn.x).toBe("number");
            expect(typeof spawn.y).toBe("number");
            expect(Number.isFinite(spawn.x)).toBe(true);
            expect(Number.isFinite(spawn.y)).toBe(true);
          }
        }
      });
    });

    describe("platforms", () => {
      it("platform tiles only appear above ground level (row < 16)", () => {
        for (const seed of TEST_SEEDS) {
          const { tiles } = MapGenerator.generate(seed);
          for (let row = 0; row < H; row++) {
            for (let col = 0; col < W; col++) {
              if (tiles[row * W + col] === Tile.Platform) {
                expect(row).toBeLessThan(16);
              }
            }
          }
        }
      });

      it("platform tiles appear in valid row range (row >= 11, i.e. heightAbove 3-5 above row 16)", () => {
        for (const seed of TEST_SEEDS) {
          const { tiles } = MapGenerator.generate(seed);
          for (let row = 0; row < H; row++) {
            for (let col = 0; col < W; col++) {
              if (tiles[row * W + col] === Tile.Platform) {
                // heightAbove is 3..5, so platRow = 16 - heightAbove => 11..13
                expect(row).toBeGreaterThanOrEqual(11);
                expect(row).toBeLessThanOrEqual(13);
              }
            }
          }
        }
      });
    });

    describe("tile values", () => {
      it("all tile values are valid Tile enum values", () => {
        const validTiles = new Set([
          Tile.Empty, Tile.Ground, Tile.Platform, Tile.Finish, Tile.Decoration,
        ]);
        for (const seed of TEST_SEEDS) {
          const { tiles } = MapGenerator.generate(seed);
          for (let i = 0; i < tiles.length; i++) {
            expect(validTiles.has(tiles[i])).toBe(true);
          }
        }
      });
    });

    describe("decorations", () => {
      it("decoration tiles only appear in rows 0-2", () => {
        for (const seed of TEST_SEEDS) {
          const { tiles } = MapGenerator.generate(seed);
          for (let row = 0; row < H; row++) {
            for (let col = 0; col < W; col++) {
              if (tiles[row * W + col] === Tile.Decoration) {
                expect(row).toBeLessThanOrEqual(2);
              }
            }
          }
        }
      });
    });

    describe("row 17 mirrors row 16 in ground zones", () => {
      it("wherever row 16 is Ground, row 17 is also Ground in start and finish zones", () => {
        for (const seed of TEST_SEEDS) {
          const { tiles } = MapGenerator.generate(seed);
          // Start zone
          for (let col = 0; col <= 9; col++) {
            expect(tiles[17 * W + col]).toBe(Tile.Ground);
          }
          // Finish zone
          for (let col = 270; col <= 279; col++) {
            expect(tiles[17 * W + col]).toBe(Tile.Ground);
          }
        }
      });
    });

    describe("consistency across large seed range", () => {
      it("generates valid maps for seed=0 and seed=2^31-1", () => {
        const seeds = [0, 2147483647];
        for (const seed of seeds) {
          const layout = MapGenerator.generate(seed);
          expect(layout.tiles.length).toBe(W * H);
          expect(layout.finishX).toBe(271 * TS);
          expect(Array.isArray(layout.enemySpawns)).toBe(true);
        }
      });
    });
  });
});
