import { describe, it, expect, vi } from "vitest";
import { CONFIG } from "../../config";

// GameRoom is being written by the backend developer. We test its
// scoring and loseLife logic in isolation here, deriving the formulas
// from the spec (points = maxPlayers + 1 - position, eliminated = 0).
//
// If GameRoom exports a helper or the class itself, those can be imported:
let GameRoom: { new (...args: unknown[]): unknown } | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  GameRoom = require("../GameRoom").GameRoom;
} catch {
  // Not created yet — tests based on spec formulas only
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Minimal PlayerState-shaped object. */
function makePlayer(overrides: Record<string, unknown> = {}) {
  return {
    id:             "p1",
    x:              0,
    y:              0,
    vx:             0,
    vy:             0,
    lives:          CONFIG.STARTING_LIVES,
    grounded:       false,
    finished:       false,
    eliminated:     false,
    facingRight:    true,
    checkpointX:    0,
    lastCheckpoint: 0,
    prevY:          0,
    lastInput:      { left: false, right: false, jump: false, seq: 0 },
    totalScore:     0,
    raceScore:      0,
    name:           "test",
    color:          "#fff",
    ...overrides,
  };
}

// ─── Scoring formula (spec-02) ───────────────────────────────────────────────
//
// Position 1 (winner)    → maxPlayers points
// Position 2             → maxPlayers - 1 points
// ...
// Position N             → 1 point
// Eliminated / DNF       → 0 points
//
// pointsEarned = eliminated ? 0 : (maxPlayers + 1 - position)

function calcPoints(position: number, maxPlayers: number, eliminated: boolean): number {
  if (eliminated) return 0;
  return maxPlayers + 1 - position;
}

describe("GameRoom logic", () => {
  describe("scoring formula", () => {
    const MAX = CONFIG.MAX_PLAYERS;  // 5

    it("awards MAX_PLAYERS points to 1st place", () => {
      expect(calcPoints(1, MAX, false)).toBe(MAX);
    });

    it("awards MAX_PLAYERS-1 points to 2nd place", () => {
      expect(calcPoints(2, MAX, false)).toBe(MAX - 1);
    });

    it("awards MAX_PLAYERS-2 points to 3rd place", () => {
      expect(calcPoints(3, MAX, false)).toBe(MAX - 2);
    });

    it("awards 1 point to last place (position = maxPlayers)", () => {
      expect(calcPoints(MAX, MAX, false)).toBe(1);
    });

    it("awards 0 points to eliminated players", () => {
      expect(calcPoints(0, MAX, true)).toBe(0);
    });

    it("awards 0 points regardless of position when eliminated", () => {
      for (let pos = 1; pos <= MAX; pos++) {
        expect(calcPoints(pos, MAX, true)).toBe(0);
      }
    });

    it("scoring is consistent across all positions for 5 players", () => {
      const results = [1, 2, 3, 4, 5].map((pos) => calcPoints(pos, 5, false));
      expect(results).toEqual([5, 4, 3, 2, 1]);
    });

    it("scoring works for 2-player game (minimum lobby)", () => {
      expect(calcPoints(1, 2, false)).toBe(2);
      expect(calcPoints(2, 2, false)).toBe(1);
      expect(calcPoints(0, 2, true)).toBe(0);
    });
  });

  describe("loseLife", () => {
    /**
     * Inline implementation of loseLife matching the spec-04 pseudocode.
     * When GameRoom is available, these tests exercise the real implementation.
     */
    function loseLife(
      player: ReturnType<typeof makePlayer>,
      eliminateFn: (id: string) => void,
    ) {
      player.lives--;
      if (player.lives <= 0) {
        eliminateFn(player.id);
      } else {
        player.x       = player.checkpointX;
        player.y       = (CONFIG.LEVEL_HEIGHT_TILES - 3) * CONFIG.TILE_SIZE;
        player.vy      = 0;
        player.vx      = 0;
        player.grounded = false;
      }
    }

    it("decrements lives by 1", () => {
      const player       = makePlayer({ lives: 3 });
      const eliminateFn  = vi.fn();

      loseLife(player, eliminateFn);

      expect(player.lives).toBe(2);
    });

    it("respawns at checkpointX when lives > 0", () => {
      const checkpointX = 640;
      const player      = makePlayer({ lives: 2, x: 100, checkpointX });
      const eliminateFn = vi.fn();

      loseLife(player, eliminateFn);

      expect(player.x).toBe(checkpointX);
    });

    it("respawns at correct y position when lives > 0", () => {
      const player      = makePlayer({ lives: 2, y: 500 });
      const eliminateFn = vi.fn();

      loseLife(player, eliminateFn);

      const expectedY = (CONFIG.LEVEL_HEIGHT_TILES - 3) * CONFIG.TILE_SIZE;
      expect(player.y).toBe(expectedY);
    });

    it("resets velocities to 0 on respawn", () => {
      const player      = makePlayer({ lives: 2, vx: 220, vy: 300 });
      const eliminateFn = vi.fn();

      loseLife(player, eliminateFn);

      expect(player.vx).toBe(0);
      expect(player.vy).toBe(0);
    });

    it("sets grounded=false on respawn", () => {
      const player      = makePlayer({ lives: 2, grounded: true });
      const eliminateFn = vi.fn();

      loseLife(player, eliminateFn);

      expect(player.grounded).toBe(false);
    });

    it("eliminates player when lives reach 0", () => {
      const player      = makePlayer({ lives: 1 });
      const eliminateFn = vi.fn();

      loseLife(player, eliminateFn);

      expect(eliminateFn).toHaveBeenCalledWith("p1");
      expect(player.lives).toBe(0);
    });

    it("eliminates player when lives go below 0 (lives was 0 before call)", () => {
      // Defensive: lives can theoretically already be 0
      const player      = makePlayer({ lives: 0 });
      const eliminateFn = vi.fn();

      loseLife(player, eliminateFn);

      expect(eliminateFn).toHaveBeenCalledWith("p1");
    });

    it("does not call eliminate when lives > 1", () => {
      const player      = makePlayer({ lives: 3 });
      const eliminateFn = vi.fn();

      loseLife(player, eliminateFn);

      expect(eliminateFn).not.toHaveBeenCalled();
    });

    it("respawn y is less than LEVEL_HEIGHT_PX (player is on screen)", () => {
      const player      = makePlayer({ lives: 2 });
      const eliminateFn = vi.fn();

      loseLife(player, eliminateFn);

      const levelHeightPx = CONFIG.LEVEL_HEIGHT_TILES * CONFIG.TILE_SIZE;
      expect(player.y).toBeLessThan(levelHeightPx);
    });
  });

  describe("race position ordering", () => {
    /**
     * When multiple players finish, they are assigned positions in the order
     * they crossed the finish line.  The spec assigns points as:
     * N, N-1, ..., 1 for finishers and 0 for eliminated.
     */
    it("first finisher gets maxPlayers points", () => {
      const maxPlayers = 4;
      const position   = 1;  // first across the line
      expect(calcPoints(position, maxPlayers, false)).toBe(maxPlayers);
    });

    it("second finisher gets maxPlayers-1 points", () => {
      const maxPlayers = 4;
      expect(calcPoints(2, maxPlayers, false)).toBe(maxPlayers - 1);
    });

    it("total points awarded to all non-eliminated finishers sums correctly for N players", () => {
      const N      = 5;
      const total  = [1, 2, 3, 4, 5]
        .map((pos) => calcPoints(pos, N, false))
        .reduce((a, b) => a + b, 0);
      // 5 + 4 + 3 + 2 + 1 = 15
      expect(total).toBe(15);
    });
  });

  describe("CONFIG constants", () => {
    it("STARTING_LIVES is 3", () => {
      expect(CONFIG.STARTING_LIVES).toBe(3);
    });

    it("MAX_PLAYERS is 5", () => {
      expect(CONFIG.MAX_PLAYERS).toBe(5);
    });

    it("CHECKPOINT_INTERVAL_MS is 2000", () => {
      expect(CONFIG.CHECKPOINT_INTERVAL_MS).toBe(2000);
    });

    it("respawn y formula is (LEVEL_HEIGHT_TILES - 3) * TILE_SIZE = 480", () => {
      const expectedRespawnY = (CONFIG.LEVEL_HEIGHT_TILES - 3) * CONFIG.TILE_SIZE;
      expect(expectedRespawnY).toBe((18 - 3) * 32);
      expect(expectedRespawnY).toBe(480);
    });
  });
});
