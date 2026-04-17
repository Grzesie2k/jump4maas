# Spec 03 — Map Generator

**Zależności**: spec-00 (Tile enum, CONFIG)  
**Równolegle z**: spec-02, spec-06, spec-07, spec-08  
**Wymagane przez**: spec-02 (GameRoom uruchamia generator), spec-04 (PhysicsEngine używa tiles[])

## Plik do stworzenia

- `server/src/game/MapGenerator.ts`

---

## Interfejs publiczny

```typescript
export interface MapLayout {
  seed:        number;
  tiles:       number[];          // flat row-major, length = WIDTH * HEIGHT, wartości z enum Tile
  enemySpawns: { x: number; y: number }[];  // px, środek sprite'a wroga
  finishX:     number;            // px, lewa krawędź linii mety (= 271 * TILE_SIZE)
}

export class MapGenerator {
  static generate(seed: number): MapLayout { ... }
}
```

---

## Seeded RNG

Użyj prostego mulberry32 — deterministyczny, bez zależności:

```typescript
function mulberry32(seed: number) {
  return function(): number {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
```

Wywołaj `const rng = mulberry32(seed)` i używaj `rng()` zamiast `Math.random()`.

---

## Wymiary

```
WIDTH  = CONFIG.LEVEL_WIDTH_TILES   = 280
HEIGHT = CONFIG.LEVEL_HEIGHT_TILES  = 18
TILE_S = CONFIG.TILE_SIZE           = 32
```

Indeksowanie: `tiles[row * WIDTH + col]`  
Rząd 0 = góra, rząd 17 = dół.

---

## Algorytm generowania (krok po kroku)

### Krok 1 — Inicjalizacja

```
tiles = new Array(WIDTH * HEIGHT).fill(Tile.Empty)
```

### Krok 2 — Strefa startowa i końcowa

Wypełnij Ground w rzędach 16–17 dla kolumn 0–9 (start) i 270–279 (meta):

```
for row in [16, 17]:
  for col in 0..9:   tiles[row * WIDTH + col] = Tile.Ground
  for col in 270..279: tiles[row * WIDTH + col] = Tile.Ground
```

### Krok 3 — Środkowe segmenty gruntu (kolumny 10–269)

Iteruj `col` od 10 do 269, generując naprzemiennie segmenty gruntu i dziury.

```
col = 10
lastGapEnd = -999  // śledzenie ostatniej dziury (constraint: min 3 kafelki między dziurami)

while col < 270:
  // Segment gruntu
  segLen = floor(rng() * 11) + 4   // 4..14
  segLen = min(segLen, 270 - col)
  for c in col..col+segLen-1, row in [16, 17]:
    tiles[row * WIDTH + c] = Tile.Ground
  
  segStart = col
  col += segLen

  if col >= 270: break

  // Dziura
  gapLen = floor(rng() * 4) + 2   // 2..5
  gapLen = min(gapLen, 270 - col, 5)  // max 5 — zawsze do przeskoczenia

  // Constraint: nie dwie dziury w ciągu 3 kafelków
  if col - lastGapEnd < 3:
    gapLen = 0  // pomiń dziurę, kontynuuj segmentem

  if gapLen > 0:
    lastGapEnd = col + gapLen
  
  col += gapLen
```

> **Uwaga**: Rząd 16 to "top of ground", rząd 17 to "fill". Gracz stoi na górze rzędu 16.

### Krok 4 — Platformy

Dla każdego segmentu gruntu dłuższego niż 6 kafelków:

```
if segLen > 6 AND rng() < 0.60:
  numPlatforms = (rng() < 0.5) ? 1 : 2
  for each platform:
    platLen = floor(rng() * 5) + 3   // 3..7
    heightAbove = floor(rng() * 2) + 3  // 3..4 kafelki powyżej rzędu 16 (row 12-13, osiągalne z JUMP_VELOCITY=-800)
    platRow = 16 - heightAbove          // np. rząd 13 jeśli heightAbove=3
    platCol = segStart + floor(rng() * max(1, segLen - platLen))
    platCol = clamp(platCol, segStart, segStart + segLen - platLen)

    for c in platCol..platCol+platLen-1:
      tiles[platRow * WIDTH + c] = Tile.Platform
```

### Krok 5 — Linia mety

Kolumna 271 (cały rząd wysokości):

```
for row in 0..17:
  tiles[row * WIDTH + 271] = Tile.Finish

finishX = 271 * TILE_S  // = 8672 px
```

Kolumny 270–279, rzędy 16–17 są już Ground (z kroku 2).

### Krok 6 — Wrogowie

Zbierz wszystkie kafelki Ground w rzędzie 16 (i kafelki Platform w rzędzie platRow) jako potencjalne miejsca spawnu.

```
enemySpawns = []
tilesSinceLastEnemy = 0

for each solid tile at (row, col) where row in [0..15] (platformy) OR row == 16 (grunt):
  tilesSinceLastEnemy++
  
  // Średnio 1 wróg na 20 kafelków, z losowością
  if tilesSinceLastEnemy >= 15 AND rng() < (tilesSinceLastEnemy / 20):
    // Nie w strefie startowej
    if col < 15: continue
    // Nie przy krawędzi segmentu (min 3 od dziury)
    if isNearGap(col, row, tiles, 3): continue

    spawnX = col * TILE_S + TILE_S / 2
    spawnY = row * TILE_S - CONFIG.ENEMY_H / 2  // tuż nad gruntem

    enemySpawns.push({ x: spawnX, y: spawnY })
    tilesSinceLastEnemy = 0
```

**`isNearGap(col, row, tiles, margin)`**: zwraca true jeśli którykolwiek z `margin` kafelków w lewo lub prawo od `col` w tym samym rzędzie jest `Tile.Empty`.

### Krok 7 — Dekoracje

```
for row in [0, 1, 2]:  // górne rzędy tła
  for col in 0..279:
    if rng() < 0.04:
      tiles[row * WIDTH + col] = Tile.Decoration
```

---

## Przykładowy zwrot

```typescript
return {
  seed,
  tiles,          // number[], length = 280 * 18 = 5040
  enemySpawns,    // { x, y }[]
  finishX: 271 * CONFIG.TILE_SIZE,
};
```

---

## Testy jednostkowe (opcjonalne, ale zalecane)

Sprawdź dla kilku seedów:

1. `tiles.length === 280 * 18`
2. Kolumny 0–9, rzędy 16–17 są Ground
3. Kolumny 270–279, rzędy 16–17 są Ground
4. Kolumna 271 zawiera Finish (dowolny rząd)
5. Żadna dziura nie jest szersza niż 5 kafelków (brak sąsiednich Empty w rzędach 16–17 ponad 5 z rzędu)
6. Żaden spawn wroga nie jest w kolumnach 0–14

---

## Uwagi implementacyjne

- `MapGenerator.generate()` jest **czystą funkcją** — ten sam seed zawsze daje tę samą mapę.
- Brak side-effectów, brak stanu globalnego.
- Nie importuj niczego z `rooms/` ani `state/` — tylko `config.ts` i `@shared/types`.
