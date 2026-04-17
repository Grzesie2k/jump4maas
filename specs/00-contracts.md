# Spec 00 — Shared Contracts

**Prerequisite dla wszystkich innych specyfikacji.**  
Inne workstreamy mogą zacząć dopiero gdy te typy są zatwierdzone (nie muszą być zaimplementowane — wystarczy że plik istnieje z poprawnymi typami).

## Pliki do stworzenia

- `server/src/config.ts`
- `shared/types.ts` (importowany przez klienta i serwer)

## `server/src/config.ts`

```typescript
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
```

## `shared/types.ts`

### Tile enum

```typescript
export enum Tile {
  Empty      = 0,
  Ground     = 1,
  Platform   = 2,
  Finish     = 3,
  Decoration = 4,
}
```

### Client → Server messages

```typescript
export interface InputMessage {
  left:  boolean;
  right: boolean;
  jump:  boolean;
  seq:   number;
}

export interface StartRaceMessage {
  type: "start_race";
}

export interface LeaveRoomMessage {
  type: "leave_room";
}
```

### Server → Client messages (room messages, nie schema)

```typescript
export interface EnemySpawn {
  x: number;
  y: number;
}

export interface MapLayoutMessage {
  type:        "map_layout";
  seed:        number;
  tiles:       number[];        // flat row-major array, length = WIDTH_TILES * HEIGHT_TILES
  enemySpawns: EnemySpawn[];
  finishX:     number;          // px, leading edge of finish line
  raceNumber:  number;
}

export interface RaceResultEntry {
  playerId:    string;
  name:        string;
  position:    number;          // 1-based; 0 = eliminated / DNF
  pointsEarned: number;
  totalScore:  number;
}

export interface RaceResultMessage {
  type:    "race_result";
  results: RaceResultEntry[];
}
```

### Colyseus Schema — sygnatury (implementacja w spec-02)

Poniższe są *interfejsami* do użytku przez klientów TS. Implementacja Colyseus `@type` dekoratorami jest w spec-02.

```typescript
export interface IPlayerState {
  id:          string;
  name:        string;
  color:       string;
  x:           number;
  y:           number;
  vx:          number;
  vy:          number;
  lives:       number;
  totalScore:  number;
  raceScore:   number;
  grounded:    boolean;
  finished:    boolean;
  eliminated:  boolean;
  facingRight: boolean;
}

export interface IEnemyState {
  id:          number;
  x:           number;
  y:           number;
  facingRight: boolean;
}

export interface IGameState {
  phase:      string;           // "waiting" | "countdown" | "racing" | "results"
  players:    Map<string, IPlayerState>;
  enemies:    IEnemyState[];
  countdown:  number;
  maxPlayers: number;
  roomName:   string;
  raceNumber: number;
}
```

## Zależności

Brak — ten plik nie importuje niczego z projektu.

## Uwagi dla implementatorów innych specs

- Importuj `Tile` i typy wiadomości z `shared/types.ts`.
- Importuj stałe fizyczne z `server/src/config.ts`.
- **Nie modyfikuj** tych plików bez koordynacji — zmiana tu psuje wszystkie workstreamy.
- `tiles[]` w `MapLayoutMessage`: indeks = `row * LEVEL_WIDTH_TILES + col`, wartości z enum `Tile`.
