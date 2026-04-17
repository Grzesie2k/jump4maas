# Specs — Podział na workstreamy

## Graf zależności

```
00-contracts  ────────────────────────────────────────────────────────┐
      │                                                                │
      ├── 01-build-setup (równolegle z 00)                            │
      │                                                                │
      ├── 02-server-core ──────────┬── 04-physics-engine ─────────────┤
      │         │                  │                                   │
      ├── 03-map-generator ────────┴── 05-enemy-ai                    │
      │                                                                │
      ├── 06-client-lobby (tylko DOM/CSS, prawie niezależne)          │
      │                                                                │
      ├── 07-client-network ──── 08-client-game-scene ── 09-hud       │
      │                                                                │
      └────────────────────────────────────────────────────────────────┘
```

## Fazy równoległe

| Faza | Specs | Bloker |
|------|-------|--------|
| **0** | `00-contracts`, `01-build-setup` | — |
| **1** | `02-server-core`, `03-map-generator`, `06-client-lobby`, `07-client-network`, `08-client-game-scene` (szkielet) | Faza 0 |
| **2** | `04-physics-engine`, `05-enemy-ai`, `09-hud-interpolator` | Faza 1 |
| **3** | Integracja end-to-end | Faza 2 |

## Przegląd specyfikacji

| Plik | Co obejmuje | Kto może robić |
|------|-------------|----------------|
| `00-contracts.md` | Typy, stałe, interfejsy wiadomości | Lider / każdy |
| `01-build-setup.md` | package.json, vite.config, tsconfig | DevOps / frontend |
| `02-server-core.md` | Colyseus room, schema, bootstrap | Backend |
| `03-map-generator.md` | Algorytm generowania mapy | Backend / algorytmy |
| `04-physics-engine.md` | AABB fizyka, gracz, tile collision | Backend |
| `05-enemy-ai.md` | Patrol wrogów | Backend |
| `06-client-lobby.md` | HTML/CSS/DOM lobby screens | Frontend |
| `07-client-network.md` | ColyseusClient singleton | Frontend |
| `08-client-game-scene.md` | Phaser GameScene, MapRenderer, PlayerSprite | Frontend/gamedev |
| `09-client-hud-interpolator.md` | HUD, minimap, interpolacja zdalnych graczy | Frontend/gamedev |

## Punkty styku (contract boundaries)

Implementatorzy różnych workstreamów muszą się zgadać na:

1. **`MapGenerator.generate(seed)`** → `{ tiles, enemySpawns, finishX }` — 03↔02, 03↔04
2. **`PhysicsEngine.tick(state, tiles, finishX, dt, room)`** + `IGameRoomCallbacks` — 04↔02
3. **`EnemyAI.spawnEnemies(spawns, enemies)` + `EnemyAI.tick(...)`** — 05↔02
4. **`ColyseusClient.*` API** — 07↔06, 07↔08
5. **`HUD` + `Interpolator` klasy** — 09↔08

## Reguły kompatybilności

- Modyfikacje `00-contracts.md` wymagają aktualizacji **wszystkich** zależnych specs
- Każdy workstream eksportuje tylko to co jest opisane w sekcji "Interfejs publiczny" danej specyfikacji
- Wewnętrzna implementacja może się różnić od spec — spec opisuje *zachowanie*, nie *jak*
- `shared/types.ts` nie może importować niczego z `server/` ani `client/`
