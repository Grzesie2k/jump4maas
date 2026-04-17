export const CONFIG = {
  GRAVITY:                1800,
  JUMP_VELOCITY:          -800,
  MOVE_SPEED:             220,
  PLAYER_W:               24,
  PLAYER_H:               40,
  ENEMY_SPEED:            60,
  ENEMY_W:                24,
  ENEMY_H:                24,
  MAX_PLAYERS:            5,
  STARTING_LIVES:         3,
  CHECKPOINT_INTERVAL_MS: 2000,
  TILE_SIZE:              32,
  LEVEL_WIDTH_TILES:      280,
  LEVEL_HEIGHT_TILES:     18,
  PHYSICS_TICK_RATE:      20,
  COUNTDOWN_SECONDS:      3,
  PLAYER_COLORS:          ["#E74C3C", "#3498DB", "#2ECC71", "#F39C12", "#9B59B6"],
} as const;

export const LEVEL_WIDTH_PX  = CONFIG.TILE_SIZE * CONFIG.LEVEL_WIDTH_TILES;   // 8960
export const LEVEL_HEIGHT_PX = CONFIG.TILE_SIZE * CONFIG.LEVEL_HEIGHT_TILES;  // 576
