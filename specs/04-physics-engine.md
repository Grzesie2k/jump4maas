# Spec 04 — Server Physics Engine

**Zależności**: spec-00 (CONFIG, Tile), spec-02 (PlayerState schema), spec-03 (MapLayout/tiles[])  
**Równolegle z**: spec-05 (EnemyAI), spec-06, spec-07, spec-08  
**Wymagane przez**: spec-02 (GameRoom wywołuje `PhysicsEngine.tick`)

## Plik do stworzenia

- `server/src/game/PhysicsEngine.ts`

---

## Interfejs publiczny

```typescript
// Zdefiniowany w GameRoom (spec-02) żeby uniknąć cyklicznego importu
interface IGameRoomCallbacks {
  finishPlayer(playerId: string):    void;
  eliminatePlayer(playerId: string): void;
}

export class PhysicsEngine {
  static tick(
    state:    GameState,
    tiles:    number[],
    finishX:  number,
    dt:       number,      // sekundy (= 1/20 = 0.05)
    room:     IGameRoomCallbacks,
  ): void
}
```

---

## Stałe (z config.ts)

```
GRAVITY       = 1800   px/s²
JUMP_VELOCITY = -620   px/s
MOVE_SPEED    = 220    px/s
PLAYER_W      = 24     px  (hitbox szerokość)
PLAYER_H      = 40     px  (hitbox wysokość)
TILE_SIZE     = 32     px
LEVEL_HEIGHT_PX = 18 * 32 = 576 px
```

Pozycja gracza `(x, y)` to **lewy-górny róg hitboxa**.

---

## Logika ticku — per gracz

Dla każdego gracza w `state.players` który NIE jest `eliminated` i NIE jest `finished`:

### 1. Wejście

```typescript
const input = player.lastInput;
```

### 2. Prędkość pozioma

```typescript
player.vx = input.left ? -MOVE_SPEED : input.right ? MOVE_SPEED : 0;
if (input.left)  player.facingRight = false;
if (input.right) player.facingRight = true;
```

### 3. Grawitacja

```typescript
player.vy += GRAVITY * dt;
```

### 4. Skok

```typescript
if (input.jump && player.grounded) {
  player.vy = JUMP_VELOCITY;
  player.grounded = false;
}
```

### 5. Przesunięcie

```typescript
const newX = player.x + player.vx * dt;
const newY = player.y + player.vy * dt;
```

### 6. Rozwiązywanie kolizji kafelkowych

Użyj funkcji `resolveCollisions(player, newX, newY, tiles)` → `{ x, y, vy, grounded }`:

#### Algorytm

```
1. Zbierz wszystkie kafelki Ground i Platform w bounding boxie nowej pozycji
   (z małym marginesem: ±1 kafelek w każdym kierunku)

2. Dla każdego kafelka (tile.x, tile.y) = (col * TS, row * TS):

   a) Jeśli typ == Platform:
      - Tylko kolizja od góry
      - Warunek: player.vy > 0 (opada) AND player.prevY + PLAYER_H <= tile.y + 1 (był nad platformą)
      - Jeśli prawda: popraw Y tak żeby gracz stał na platformie, ustaw vy=0, grounded=true

   b) Jeśli typ == Ground:
      - Kolizja od każdej strony (AABB):
        1. Oblicz głębokość penetracji dla osi X i Y
        2. Wypchnij wzdłuż osi z mniejszą penetracją
        3. Jeśli wypychasz w górę (rozwiązanie Y, gracz spadał): vy=0, grounded=true
        4. Jeśli wypychasz w bok (rozwiązanie X): vx=0

3. Zwróć finalną pozycję {x, y, vy, grounded}
```

**Implementacja AABB overlap:**

```typescript
function aabbOverlap(
  ax: number, ay: number, aw: number, ah: number,  // gracz
  bx: number, by: number, bw: number, bh: number,  // kafelek
): { overlapX: number; overlapY: number } | null {
  const ox = (ax + aw / 2) - (bx + bw / 2);
  const oy = (ay + ah / 2) - (by + bh / 2);
  const hw = (aw + bw) / 2;
  const hh = (ah + bh) / 2;
  if (Math.abs(ox) >= hw || Math.abs(oy) >= hh) return null;
  return { overlapX: hw - Math.abs(ox), overlapY: hh - Math.abs(oy) };
}
```

### 7. Zapis stanu

```typescript
player.prevY    = player.y;    // przed nadpisaniem — do sprawdzenia platform
player.x        = resolvedX;
player.y        = resolvedY;
player.vy       = resolvedVy;
player.grounded = resolvedGrounded;
```

Jeśli `!resolvedGrounded`: `player.grounded = false`.

### 8. Checkpoint

```typescript
const now = Date.now();
if (player.grounded && now - player.lastCheckpoint >= CONFIG.CHECKPOINT_INTERVAL_MS) {
  player.checkpointX    = player.x;
  player.lastCheckpoint = now;
}
```

### 9. Wykrycie upadku

```typescript
if (player.y > LEVEL_HEIGHT_PX + 64) {
  loseLife(player, room);
}
```

### 10. Wykrycie kolizji z wrogami

```typescript
for (const enemy of state.enemies) {
  if (aabbOverlap(
    player.x, player.y, PLAYER_W, PLAYER_H,
    enemy.x - ENEMY_W/2, enemy.y - ENEMY_H/2, ENEMY_W, ENEMY_H
  )) {
    loseLife(player, room);
    break;  // tylko 1 życie na tick
  }
}
```

Hitbox wroga: środek w `(enemy.x, enemy.y)`, rozmiar `24×24`.

### 11. Wykrycie mety

```typescript
const playerCenterX = player.x + PLAYER_W / 2;
if (playerCenterX >= finishX) {
  room.finishPlayer(player.id);
}
```

---

## Pomocnicze: `loseLife`

```typescript
function loseLife(player: PlayerState, room: IGameRoomCallbacks): void {
  player.lives--;
  if (player.lives <= 0) {
    room.eliminatePlayer(player.id);
  } else {
    // Respawn na checkpoincie
    player.x       = player.checkpointX;
    player.y       = (CONFIG.LEVEL_HEIGHT_TILES - 3) * CONFIG.TILE_SIZE;
    player.vy      = 0;
    player.vx      = 0;
    player.grounded = false;
  }
}
```

---

## Pomocnicze: pobieranie kafelków

```typescript
function getTileAt(tiles: number[], col: number, row: number): number {
  if (col < 0 || col >= CONFIG.LEVEL_WIDTH_TILES) return Tile.Ground;  // ściana boczna
  if (row < 0) return Tile.Empty;
  if (row >= CONFIG.LEVEL_HEIGHT_TILES) return Tile.Ground;
  return tiles[row * CONFIG.LEVEL_WIDTH_TILES + col];
}

function isSolid(tile: number): boolean {
  return tile === Tile.Ground || tile === Tile.Platform;
}
```

Przy kolizji sprawdzaj kafelki których prostokąt `[col*TS, row*TS, TS, TS]` zachodzi na bounding box gracza.

---

## Uwagi

- `PhysicsEngine.tick` jest wywoływany przez `GameRoom` co 50ms (20 Hz).
- Wrogowie są **osobnym** systemem — `EnemyAI.tick` (spec-05) wywoływany oddzielnie po `PhysicsEngine.tick`.
- Kolizja gracz–gracz **nie istnieje** — gracze przez siebie przechodzą.
- `player.prevY` musi być zapisany **przed** aktualizacją `player.y` — używany w następnym ticku do sprawdzenia platform.
