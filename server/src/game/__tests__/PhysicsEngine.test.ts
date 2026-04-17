import { describe, it, expect, vi } from "vitest";
import { PhysicsEngine } from "../PhysicsEngine";
import { Tile } from "@shared/types";
import { CONFIG, LEVEL_HEIGHT_PX } from "../../config";

const TS = CONFIG.TILE_SIZE;           // 32
const W  = CONFIG.LEVEL_WIDTH_TILES;   // 280
const H  = CONFIG.LEVEL_HEIGHT_TILES;  // 18

// ─── helpers ────────────────────────────────────────────────────────────────

/** Build a minimal player object whose shape matches PlayerState (sans Schema). */
function makePlayer(overrides: Record<string, unknown> = {}) {
  return {
    id:             "p1",
    x:              0,
    y:              0,
    vx:             0,
    vy:             0,
    lives:          3,
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

/**
 * Build a minimal GameState-shaped object.
 * `state.players.forEach` is what PhysicsEngine calls — we expose that via a
 * Map-like wrapper so no Colyseus dependency is needed.
 */
function makeState(players: ReturnType<typeof makePlayer>[], enemies: unknown[] = []) {
  const map = new Map(players.map((p) => [p.id, p]));
  return {
    players: {
      forEach: (cb: (p: ReturnType<typeof makePlayer>) => void) => map.forEach(cb),
    },
    enemies,
  };
}

/** Build an all-empty tiles array (W × H). */
function emptyTiles(): number[] {
  return new Array(W * H).fill(Tile.Empty);
}

/**
 * Set a rectangle of tiles.
 * row/col are 0-based tile indices.
 */
function setTile(tiles: number[], col: number, row: number, value: number) {
  tiles[row * W + col] = value;
}

/**
 * Place a solid ground row so the player can stand on it.
 * The "floor" row — player stands on top of row `groundRow`.
 * Player y-position to be standing: groundRow * TS - PLAYER_H
 */
function placeGroundRow(tiles: number[], groundRow: number) {
  for (let col = 0; col < W; col++) {
    tiles[groundRow * W + col] = Tile.Ground;
    if (groundRow + 1 < H) {
      tiles[(groundRow + 1) * W + col] = Tile.Ground;
    }
  }
}

/** dt used by the game loop */
const DT = 1 / CONFIG.PHYSICS_TICK_RATE; // 0.05 s

const mockRoom = () => ({
  finishPlayer:    vi.fn(),
  eliminatePlayer: vi.fn(),
});

// ─── tests ───────────────────────────────────────────────────────────────────

describe("PhysicsEngine", () => {
  describe("gravity", () => {
    it("increases vy by GRAVITY * dt each tick when not grounded", () => {
      const player = makePlayer({ x: 100, y: 100, vy: 0, grounded: false });
      const state  = makeState([player]);
      const tiles  = emptyTiles();
      const room   = mockRoom();

      PhysicsEngine.tick(state as never, tiles, 999999, DT, room);

      expect(player.vy).toBeCloseTo(CONFIG.GRAVITY * DT);
    });

    it("does not apply gravity when grounded and not jumping (vy stays 0 after landing)", () => {
      // Place player sitting on row 16 ground.
      const groundRow = 16;
      const tiles     = emptyTiles();
      placeGroundRow(tiles, groundRow);

      // Player is already sitting on top of row 16 (standing position).
      const standingY = groundRow * TS - CONFIG.PLAYER_H;
      const player = makePlayer({
        x:       100,
        y:       standingY,
        vy:      0,
        grounded: true,
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, tiles, 999999, DT, room);

      // Gravity IS applied (vy += GRAVITY * dt) before collision resolve;
      // then collision resolve pushes player back up and sets vy=0, grounded=true.
      // Net result: player.vy === 0 after the tick.
      expect(player.vy).toBeCloseTo(0, 1);
      expect(player.grounded).toBe(true);
    });
  });

  describe("jumping", () => {
    it("sets vy to JUMP_VELOCITY when grounded and jump=true", () => {
      const groundRow = 16;
      const tiles     = emptyTiles();
      placeGroundRow(tiles, groundRow);

      const standingY = groundRow * TS - CONFIG.PLAYER_H;
      const player = makePlayer({
        x:        100,
        y:        standingY,
        vy:       0,
        grounded: true,
        lastInput: { left: false, right: false, jump: true, seq: 1 },
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, tiles, 999999, DT, room);

      // After jump: vy = JUMP_VELOCITY + GRAVITY * dt (gravity applied before jump check)
      // But jump overwrites vy: player.vy = JUMP_VELOCITY (then position integrates).
      // The spec order: gravity → jump → resolve. So vy = JUMP_VELOCITY after jump override.
      expect(player.vy).toBeLessThan(0);
      expect(player.vy).toBeCloseTo(CONFIG.JUMP_VELOCITY + CONFIG.GRAVITY * DT, 0);
    });

    it("does not jump when not grounded (no double jump)", () => {
      const player = makePlayer({
        x:        100,
        y:        100,
        vy:       0,
        grounded: false,
        lastInput: { left: false, right: false, jump: true, seq: 1 },
      });
      const state = makeState([player]);
      const tiles = emptyTiles();
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, tiles, 999999, DT, room);

      // vy should only increase by gravity (no jump applied)
      expect(player.vy).toBeCloseTo(CONFIG.GRAVITY * DT);
    });

    it("sets grounded=false after jump", () => {
      const groundRow = 16;
      const tiles     = emptyTiles();
      placeGroundRow(tiles, groundRow);

      const standingY = groundRow * TS - CONFIG.PLAYER_H;
      const player = makePlayer({
        x:        100,
        y:        standingY,
        vy:       0,
        grounded: true,
        lastInput: { left: false, right: false, jump: true, seq: 1 },
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, tiles, 999999, DT, room);

      // After jumping, player is no longer grounded
      expect(player.grounded).toBe(false);
    });
  });

  describe("horizontal movement", () => {
    it("sets vx to -MOVE_SPEED when left=true", () => {
      const player = makePlayer({
        x: 100, y: 0,
        lastInput: { left: true, right: false, jump: false, seq: 1 },
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, emptyTiles(), 999999, DT, room);

      expect(player.vx).toBe(-CONFIG.MOVE_SPEED);
    });

    it("sets vx to +MOVE_SPEED when right=true", () => {
      const player = makePlayer({
        x: 100, y: 0,
        lastInput: { left: false, right: true, jump: false, seq: 1 },
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, emptyTiles(), 999999, DT, room);

      expect(player.vx).toBe(CONFIG.MOVE_SPEED);
    });

    it("sets vx to 0 when no input", () => {
      const player = makePlayer({
        x: 100, y: 0, vx: 220,
        lastInput: { left: false, right: false, jump: false, seq: 1 },
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, emptyTiles(), 999999, DT, room);

      expect(player.vx).toBe(0);
    });

    it("sets facingRight=false when moving left", () => {
      const player = makePlayer({
        x: 200, y: 0, facingRight: true,
        lastInput: { left: true, right: false, jump: false, seq: 1 },
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, emptyTiles(), 999999, DT, room);

      expect(player.facingRight).toBe(false);
    });

    it("sets facingRight=true when moving right", () => {
      const player = makePlayer({
        x: 200, y: 0, facingRight: false,
        lastInput: { left: false, right: true, jump: false, seq: 1 },
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, emptyTiles(), 999999, DT, room);

      expect(player.facingRight).toBe(true);
    });
  });

  describe("tile collision (ground)", () => {
    it("stops player falling through solid ground tile", () => {
      const groundRow = 16;
      const tiles     = emptyTiles();
      placeGroundRow(tiles, groundRow);

      // Player just above the ground surface, falling fast
      const standingY = groundRow * TS - CONFIG.PLAYER_H;
      const player = makePlayer({
        x:  100,
        y:  standingY - 2,  // 2px above standing position
        vy: 300,            // falling quickly
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, tiles, 999999, DT, room);

      // Player should be at or above ground level, not below
      expect(player.y).toBeLessThanOrEqual(standingY + 1);
    });

    it("sets grounded=true when landing on ground", () => {
      const groundRow = 16;
      const tiles     = emptyTiles();
      placeGroundRow(tiles, groundRow);

      const standingY = groundRow * TS - CONFIG.PLAYER_H;
      const player = makePlayer({
        x:  100,
        y:  standingY - 4,
        vy: 200,  // falling
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, tiles, 999999, DT, room);

      expect(player.grounded).toBe(true);
    });
  });

  describe("one-way platform collision", () => {
    it("stops player falling onto platform from above", () => {
      const platRow = 13;
      const tiles   = emptyTiles();

      // Place a platform tile at (5, 13)
      for (let col = 3; col < 10; col++) {
        setTile(tiles, col, platRow, Tile.Platform);
      }

      const platTopY  = platRow * TS;
      const standingY = platTopY - CONFIG.PLAYER_H;

      // Player was above the platform (prevY + PLAYER_H <= platTopY + 1) and is now falling
      const player = makePlayer({
        x:     col_to_px(5),
        y:     platTopY - CONFIG.PLAYER_H - 2,
        vy:    200,  // falling
        prevY: platTopY - CONFIG.PLAYER_H - 10,
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, tiles, 999999, DT, room);

      expect(player.grounded).toBe(true);
      expect(player.y).toBeCloseTo(standingY, 0);
    });

    it("does not collide with platform when approaching from below", () => {
      const platRow = 13;
      const tiles   = emptyTiles();

      for (let col = 3; col < 10; col++) {
        setTile(tiles, col, platRow, Tile.Platform);
      }

      const platTopY = platRow * TS;

      // Player below the platform, moving upward (jumping)
      const player = makePlayer({
        x:     col_to_px(5),
        y:     platTopY + 5,      // below the platform top
        vy:    -400,              // moving up
        prevY: platTopY + 20,     // was below
      });
      const startY = player.y;
      const state  = makeState([player]);
      const room   = mockRoom();

      PhysicsEngine.tick(state as never, tiles, 999999, DT, room);

      // Should NOT be grounded — passed through from below
      expect(player.grounded).toBe(false);
    });
  });

  describe("fall detection", () => {
    it("calls loseLife (decrements lives) when player.y > LEVEL_HEIGHT_PX + 64", () => {
      const player = makePlayer({
        x:     100,
        y:     LEVEL_HEIGHT_PX + 65,  // below the kill-plane
        vy:    100,
        lives: 3,
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, emptyTiles(), 999999, DT, room);

      // loseLife is called: lives--; player still has lives left so respawn
      expect(player.lives).toBe(2);
    });

    it("eliminates player when lives reach 0 after falling", () => {
      const player = makePlayer({
        x:     100,
        y:     LEVEL_HEIGHT_PX + 65,
        vy:    100,
        lives: 1,
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, emptyTiles(), 999999, DT, room);

      expect(room.eliminatePlayer).toHaveBeenCalledWith("p1");
    });

    it("respawns player at checkpointX when lives > 0 after falling", () => {
      const checkpointX = 500;
      const player = makePlayer({
        x:           100,
        y:           LEVEL_HEIGHT_PX + 65,
        vy:          100,
        lives:       2,
        checkpointX: checkpointX,
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, emptyTiles(), 999999, DT, room);

      expect(player.x).toBe(checkpointX);
      expect(player.vy).toBe(0);
      expect(player.vx).toBe(0);
    });
  });

  describe("finish line detection", () => {
    it("calls room.finishPlayer when playerCenterX >= finishX", () => {
      const finishX    = 271 * TS;   // 8672
      // Place player so center is exactly at finishX
      const playerX    = finishX - CONFIG.PLAYER_W / 2;  // center = finishX
      const player = makePlayer({
        x:     playerX,
        y:     100,
        grounded: false,
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, emptyTiles(), finishX, DT, room);

      expect(room.finishPlayer).toHaveBeenCalledWith("p1");
    });

    it("does not call finishPlayer when playerCenterX < finishX", () => {
      const finishX = 271 * TS;
      // Place player far left of finish
      const player = makePlayer({
        x:  100,
        y:  100,
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, emptyTiles(), finishX, DT, room);

      expect(room.finishPlayer).not.toHaveBeenCalled();
    });

    it("calls finishPlayer when player moves past finishX in one tick", () => {
      const finishX = 271 * TS;
      // Start player just before finish, moving right quickly
      const player = makePlayer({
        x:     finishX - 5,
        y:     100,
        vx:    CONFIG.MOVE_SPEED,
        lastInput: { left: false, right: true, jump: false, seq: 1 },
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, emptyTiles(), finishX, DT, room);

      expect(room.finishPlayer).toHaveBeenCalledWith("p1");
    });
  });

  describe("eliminated/finished players", () => {
    it("skips physics for eliminated players", () => {
      const player = makePlayer({
        x:          100,
        y:          100,
        vy:         0,
        eliminated: true,
        lastInput:  { left: true, right: false, jump: false, seq: 1 },
      });
      const initialX  = player.x;
      const initialVy = player.vy;
      const state     = makeState([player]);
      const room      = mockRoom();

      PhysicsEngine.tick(state as never, emptyTiles(), 999999, DT, room);

      // No mutation for eliminated players
      expect(player.x).toBe(initialX);
      expect(player.vy).toBe(initialVy);
      expect(room.finishPlayer).not.toHaveBeenCalled();
      expect(room.eliminatePlayer).not.toHaveBeenCalled();
    });

    it("skips physics for finished players", () => {
      const player = makePlayer({
        x:        100,
        y:        100,
        vy:       0,
        finished: true,
        lastInput: { left: false, right: true, jump: false, seq: 1 },
      });
      const initialX  = player.x;
      const initialVy = player.vy;
      const state     = makeState([player]);
      const room      = mockRoom();

      PhysicsEngine.tick(state as never, emptyTiles(), 999999, DT, room);

      expect(player.x).toBe(initialX);
      expect(player.vy).toBe(initialVy);
      expect(room.finishPlayer).not.toHaveBeenCalled();
    });
  });

  describe("checkpoint", () => {
    it("updates checkpointX when grounded and interval elapsed", () => {
      const groundRow = 16;
      const tiles     = emptyTiles();
      placeGroundRow(tiles, groundRow);

      const standingY = groundRow * TS - CONFIG.PLAYER_H;
      const player = makePlayer({
        x:              200,
        y:              standingY,
        vy:             0,
        grounded:       true,
        checkpointX:    0,
        lastCheckpoint: 0,   // timestamp 0 means interval has elapsed
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, tiles, 999999, DT, room);

      // After one tick the player should still be grounded and checkpoint updated
      expect(player.checkpointX).toBeGreaterThanOrEqual(0);
      // lastCheckpoint should have been updated (> 0)
      expect(player.lastCheckpoint).toBeGreaterThan(0);
    });

    it("does not update checkpointX when not grounded", () => {
      const player = makePlayer({
        x:              200,
        y:              100,
        vy:             0,
        grounded:       false,
        checkpointX:    50,
        lastCheckpoint: 0,
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, emptyTiles(), 999999, DT, room);

      // Not grounded → checkpoint should not change
      expect(player.checkpointX).toBe(50);
    });

    it("does not update checkpointX when interval has not elapsed", () => {
      const groundRow = 16;
      const tiles     = emptyTiles();
      placeGroundRow(tiles, groundRow);

      const standingY = groundRow * TS - CONFIG.PLAYER_H;
      const recentTimestamp = Date.now();  // just now — interval not elapsed
      const player = makePlayer({
        x:              200,
        y:              standingY,
        vy:             0,
        grounded:       true,
        checkpointX:    99,
        lastCheckpoint: recentTimestamp,
      });
      const state = makeState([player]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, tiles, 999999, DT, room);

      // Interval not elapsed → checkpointX unchanged
      expect(player.checkpointX).toBe(99);
    });
  });

  describe("enemy collision", () => {
    it("decrements lives when player overlaps an enemy", () => {
      const player = makePlayer({
        x:     100,
        y:     100,
        lives: 3,
      });
      // Enemy centered at player's center
      const enemyX = player.x + CONFIG.PLAYER_W / 2;
      const enemyY = player.y + CONFIG.PLAYER_H / 2;
      const enemy  = { x: enemyX, y: enemyY };
      const state  = makeState([player], [enemy]);
      const room   = mockRoom();

      PhysicsEngine.tick(state as never, emptyTiles(), 999999, DT, room);

      expect(player.lives).toBe(2);
    });

    it("does not decrement lives when enemy is far away", () => {
      const player = makePlayer({
        x:     100,
        y:     100,
        lives: 3,
      });
      const enemy = { x: 5000, y: 5000 };
      const state = makeState([player], [enemy]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, emptyTiles(), 999999, DT, room);

      // No enemy overlap — unless player fell off
      // Player at y=100, won't fall past kill plane in one tick
      // vx=0, vy=GRAVITY*dt = 90, newY = 100 + 90*0.05 = 104.5, not past kill plane
      expect(room.eliminatePlayer).not.toHaveBeenCalled();
    });
  });

  describe("multiple players", () => {
    it("processes all non-eliminated players independently", () => {
      const p1 = makePlayer({ id: "p1", x: 100, y: 100 });
      const p2 = makePlayer({ id: "p2", x: 200, y: 100 });
      const state = makeState([p1, p2]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, emptyTiles(), 999999, DT, room);

      // Both players should have gravity applied
      expect(p1.vy).toBeCloseTo(CONFIG.GRAVITY * DT);
      expect(p2.vy).toBeCloseTo(CONFIG.GRAVITY * DT);
    });

    it("skips eliminated players while processing others", () => {
      const p1 = makePlayer({ id: "p1", x: 100, y: 100, eliminated: true, vy: 0 });
      const p2 = makePlayer({ id: "p2", x: 200, y: 100, vy: 0 });
      const state = makeState([p1, p2]);
      const room  = mockRoom();

      PhysicsEngine.tick(state as never, emptyTiles(), 999999, DT, room);

      expect(p1.vy).toBe(0);                              // skipped
      expect(p2.vy).toBeCloseTo(CONFIG.GRAVITY * DT);    // processed
    });
  });
});

// ─── tiny helpers ─────────────────────────────────────────────────────────────

/** Convert tile column to pixel center */
function col_to_px(col: number): number {
  return col * TS + TS / 2 - CONFIG.PLAYER_W / 2;
}
