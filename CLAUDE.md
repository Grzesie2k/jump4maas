# jump4maas — wskazówki dla Claude Code

## Utrzymanie spójności specs z kodem

Po każdej zmianie w plikach źródłowych zaktualizuj odpowiednią specę w `specs/`:

| Zmieniony plik | Spec do aktualizacji |
|---|---|
| `server/package.json`, `server/tsconfig.json`, `client/package.json`, `client/tsconfig.json`, `client/index.html` (layout/CSS), `client/vite.config.ts` | `specs/01-build-setup.md` |
| `server/src/index.ts`, `server/src/state/GameState.ts`, `server/src/rooms/GameRoom.ts` | `specs/02-server-core.md` |
| `server/src/game/MapGenerator.ts` | `specs/03-map-generator.md` |
| `server/src/game/PhysicsEngine.ts` | `specs/04-physics-engine.md` |
| `server/src/game/EnemyAI.ts` | `specs/05-enemy-ai.md` |
| `client/src/ui/LobbyUI.ts`, `client/src/ui/lobby.css` | `specs/06-client-lobby.md` |
| `client/src/network/ColyseusClient.ts` | `specs/07-client-network.md` |
| `client/src/main.ts`, `client/src/scenes/*.ts`, `client/src/game/MapRenderer.ts`, `client/src/game/PlayerSprite.ts` | `specs/08-client-game-scene.md` |
| `client/src/game/HUD.ts`, `client/src/game/Interpolator.ts` | `specs/09-client-hud-interpolator.md` |

Zasada: spec powinna odzwierciedlać **rzeczywisty stan kodu**, nie pierwotny zamysł. Aktualizuj kod specyfikacji w markdown (bloki ```typescript / ```json / ```css) oraz sekcję Uwagi gdy zmienia się zachowanie lub kontrakt.
