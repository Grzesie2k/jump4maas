# Spec 05 — Enemy AI

**Zależności**: spec-00 (CONFIG, Tile), spec-02 (EnemyState schema), spec-03 (MapLayout)  
**Równolegle z**: spec-04 (PhysicsEngine)  
**Wymagane przez**: spec-02 (GameRoom wywołuje `EnemyAI.tick` i `EnemyAI.spawnEnemies`)

## Plik do stworzenia

- `server/src/game/EnemyAI.ts`

---

## Interfejs publiczny

```typescript
import { ArraySchema } from "@colyseus/schema";
import { EnemyState } from "../state/GameState";
import type { EnemySpawn } from "@shared/types";

export class EnemyAI {
  /** Wywoływane raz na start wyścigu przez GameRoom */
  static spawnEnemies(
    spawns:  EnemySpawn[],
    enemies: ArraySchema<EnemyState>,
  ): void

  /** Wywoływane co tick przez GameRoom, po PhysicsEngine.tick */
  static tick(
    enemies: ArraySchema<EnemyState>,
    tiles:   number[],
    dt:      number,
  ): void
}
```

---

## `spawnEnemies`

Tworzy obiekty `EnemyState` na podstawie listy spawnów wygenerowanej przez `MapGenerator` (spec-03).

```typescript
static spawnEnemies(spawns: EnemySpawn[], enemies: ArraySchema<EnemyState>): void {
  spawns.forEach((spawn, i) => {
    const enemy      = new EnemyState();
    enemy.id         = i;
    enemy.x          = spawn.x;
    enemy.y          = spawn.y;
    enemy.facingRight = true;

    // Wyznacz patrol range: kafelki "pod nogami" wroga (rząd bezpośrednio pod enemy.y)
    // MapGenerator gwarantuje że spawn jest na solidnym kafelku — patrol to cały segment
    const { minX, maxX } = getPatrolRange(spawn.x, spawn.y, tiles);
    enemy.minX = minX;
    enemy.maxX = maxX;

    enemies.push(enemy);
  });
}
```

---

## `tick`

```typescript
static tick(enemies: ArraySchema<EnemyState>, tiles: number[], dt: number): void {
  for (const enemy of enemies) {
    const speed = CONFIG.ENEMY_SPEED;
    const move  = enemy.facingRight ? speed * dt : -speed * dt;

    const nextX = enemy.x + move;

    // Zawróć na krawędzi segmentu lub przy ścianie
    const hitWall    = isWall(nextX, enemy.y, enemy.facingRight, tiles);
    const offPlatform = nextX < enemy.minX || nextX > enemy.maxX;

    if (hitWall || offPlatform) {
      enemy.facingRight = !enemy.facingRight;
    } else {
      enemy.x = nextX;
    }
  }
}
```

---

## Pomocnicze

### `getPatrolRange`

Wyznacza zakres X patrolu na podstawie ciągłego segmentu gruntu lub platformy pod daną pozycją.

```typescript
function getPatrolRange(
  spawnX: number,
  spawnY: number,
  tiles:  number[],
): { minX: number; maxX: number } {
  const TS  = CONFIG.TILE_SIZE;
  const col = Math.floor(spawnX / TS);
  const row = Math.floor(spawnY / TS) + 1;  // rząd pod wrogiem

  // Idź w lewo
  let left = col;
  while (left > 0 && isSolid(getTileAt(tiles, left - 1, row))) left--;

  // Idź w prawo
  let right = col;
  const W   = CONFIG.LEVEL_WIDTH_TILES;
  while (right < W - 1 && isSolid(getTileAt(tiles, right + 1, row))) right++;

  // Zwróć środki kafelków (wróg oscyluje między środkami krańcowych kafelków)
  return {
    minX: left  * TS + TS / 2,
    maxX: right * TS + TS / 2,
  };
}
```

### `isWall`

Sprawdza czy następna pozycja trafi w solidny kafelek (ściana boczna).

```typescript
function isWall(x: number, y: number, facingRight: boolean, tiles: number[]): boolean {
  const TS    = CONFIG.TILE_SIZE;
  const halfW = CONFIG.ENEMY_W / 2;
  const checkX = facingRight ? x + halfW : x - halfW;
  const col    = Math.floor(checkX / TS);
  const row    = Math.floor(y / TS);
  return getTileAt(tiles, col, row) === Tile.Ground;
}
```

### `getTileAt` / `isSolid`

Tożsame z tymi w `PhysicsEngine` — możesz wyekstrahować do `server/src/game/tileUtils.ts` i importować w obu plikach:

```typescript
// server/src/game/tileUtils.ts
export function getTileAt(tiles: number[], col: number, row: number): number {
  if (col < 0 || col >= CONFIG.LEVEL_WIDTH_TILES) return Tile.Ground;
  if (row < 0) return Tile.Empty;
  if (row >= CONFIG.LEVEL_HEIGHT_TILES) return Tile.Ground;
  return tiles[row * CONFIG.LEVEL_WIDTH_TILES + col];
}

export function isSolid(tile: number): boolean {
  return tile === Tile.Ground || tile === Tile.Platform;
}
```

---

## Zachowanie wroga — podsumowanie

- Prędkość: **60 px/s** w stałym kierunku
- Zawraca gdy: trafi w ścianę (`Tile.Ground` z boku) LUB wyjdzie poza `[minX, maxX]`
- **Nie spada** — trzyma się swojego segmentu (nie ma grawitacji na wrogach)
- **Nie jest eliminowalny** przez gracza pod żadnym warunkiem
- Pozycja `(x, y)` to **środek** sprite'a wroga (hitbox: `±12px` w każdą stronę)

---

## Uwagi

- `EnemyAI.tick` jest wywoływany **po** `PhysicsEngine.tick` w tej samej ramce — kolejność nie ma znaczenia dla kolizji (PhysicsEngine sprawdza pozycje wrogów z bieżącego stanu)
- `EnemyState.minX/maxX` to pola nie-schemowe (tylko serwer) — nie są synchronizowane z klientem
- Klient renderuje wrogów na podstawie `enemy.x`, `enemy.y`, `enemy.facingRight` z Colyseus state (spec-08)
