# Spec 02 — Server Core (Colyseus Room + Schema)

**Zależności**: spec-00 (contracts)  
**Równolegle z**: spec-03, spec-06, spec-07, spec-08  
**Wymagane przez**: spec-04, spec-05, spec-09

## Pliki do stworzenia

- `server/src/index.ts`
- `server/src/state/GameState.ts`
- `server/src/rooms/GameRoom.ts`

---

## `server/src/index.ts`

```typescript
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import { createServer } from "http";
import { GameRoom } from "./rooms/GameRoom";

const app = express();
app.use(express.static("../../client/dist"));

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("game_room", GameRoom).enableRealtimeListing();

httpServer.listen(2567, () => console.log("Server running on :2567"));
```

---

## `server/src/state/GameState.ts`

Implementacja Colyseus Schema na podstawie sygnatur z spec-00.

```typescript
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import { CONFIG } from "../config";

export class PlayerState extends Schema {
  @type("string")  id:          string = "";
  @type("string")  name:        string = "";
  @type("string")  color:       string = "";
  @type("float32") x:           number = 0;
  @type("float32") y:           number = 0;
  @type("float32") vx:          number = 0;
  @type("float32") vy:          number = 0;
  @type("int8")    lives:       number = CONFIG.STARTING_LIVES;
  @type("int16")   totalScore:  number = 0;
  @type("int16")   raceScore:   number = 0;
  @type("boolean") grounded:    boolean = false;
  @type("boolean") finished:    boolean = false;
  @type("boolean") eliminated:  boolean = false;
  @type("boolean") facingRight: boolean = true;

  // Stan nie-schemowy (serwer tylko)
  checkpointX:    number = 0;
  lastCheckpoint: number = 0;  // timestamp ms
  lastInput:      { left: boolean; right: boolean; jump: boolean; seq: number } =
    { left: false, right: false, jump: false, seq: 0 };
  prevY:          number = 0;  // pozycja Y poprzedniej klatki (do platform one-way)
}

export class EnemyState extends Schema {
  @type("uint8")   id:          number  = 0;
  @type("float32") x:           number  = 0;
  @type("float32") y:           number  = 0;
  @type("boolean") facingRight: boolean = true;

  // Stan nie-schemowy
  minX: number = 0;
  maxX: number = 0;
}

export class GameState extends Schema {
  @type("string")               phase:      string = "waiting";
  @type({ map: PlayerState })   players     = new MapSchema<PlayerState>();
  @type([ EnemyState ])         enemies     = new ArraySchema<EnemyState>();
  @type("int8")                 countdown:  number = 0;
  @type("int8")                 maxPlayers: number = 2;
  @type("string")               roomName:   string = "";
  @type("int8")                 raceNumber: number = 0;
}
```

---

## `server/src/rooms/GameRoom.ts`

Room obsługuje cykl życia pokoju. Logika fizyki i generowania mapy jest delegowana do dedykowanych klas (spec-03, spec-04, spec-05) — tu są tylko integracje.

### Interfejsy wewnętrzne (do użytku przez inne klasy serwerowe)

```typescript
export interface RoomServices {
  mapGenerator: IMapGenerator;   // spec-03
  physics:      IPhysicsEngine;  // spec-04
  enemyAI:      IEnemyAI;        // spec-05
}
```

### Pełna implementacja `GameRoom`

```typescript
import { Room, Client } from "colyseus";
import { GameState, PlayerState, EnemyState } from "../state/GameState";
import { CONFIG } from "../config";
import type { InputMessage, StartRaceMessage, MapLayoutMessage } from "@shared/types";
// Implementacje dostarczane przez spec-03, spec-04, spec-05:
import { MapGenerator } from "../game/MapGenerator";
import { PhysicsEngine } from "../game/PhysicsEngine";
import { EnemyAI } from "../game/EnemyAI";

export class GameRoom extends Room<GameState> {
  private hostId:        string = "";
  private finishCounter: number = 0;
  private lobbySize:     number = 0;  // maxPlayers w momencie startu wyścigu
  private physicsInterval: ReturnType<typeof setInterval> | null = null;

  onCreate(options: { roomName: string; maxPlayers: number }) {
    this.setState(new GameState());
    this.state.roomName   = options.roomName ?? "Room";
    this.state.maxPlayers = Math.min(Math.max(options.maxPlayers ?? 2, 2), CONFIG.MAX_PLAYERS);
    this.maxClients = this.state.maxPlayers;

    this.onMessage("input",      (client, msg: InputMessage)      => this.handleInput(client, msg));
    this.onMessage("start_race", (client, msg: StartRaceMessage)  => this.handleStartRace(client));
    this.onMessage("leave_room", (client, msg)                    => client.leave());
  }

  onJoin(client: Client, options: { name: string }) {
    const colorIndex = this.state.players.size;  // 0-based, max 4
    const player     = new PlayerState();
    player.id    = client.sessionId;
    player.name  = (options.name ?? "Player").substring(0, 16);
    player.color = CONFIG.PLAYER_COLORS[colorIndex] ?? CONFIG.PLAYER_COLORS[0];
    this.state.players.set(client.sessionId, player);

    if (this.state.players.size === 1) {
      this.hostId = client.sessionId;
    }

    // Auto-start gdy pokój pełny
    if (this.state.players.size === this.state.maxPlayers && this.state.phase === "waiting") {
      this.startCountdown();
    }
  }

  onLeave(client: Client, consented: boolean) {
    this.state.players.delete(client.sessionId);

    if (client.sessionId === this.hostId) {
      const next = this.state.players.keys().next().value;
      this.hostId = next ?? "";
    }

    // Jeśli race w toku i nie ma już żadnych graczy — zakończ wyścig
    if (this.state.phase === "racing" && this.state.players.size < 1) {
      this.endRace();
    }
  }

  onDispose() {
    if (this.physicsInterval) clearInterval(this.physicsInterval);
  }

  // ── Handlery wiadomości ──────────────────────────────────────────────────

  private handleInput(client: Client, msg: InputMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.eliminated || player.finished) return;
    if (msg.seq > player.lastInput.seq) {
      player.lastInput = msg;
    }
  }

  private handleStartRace(client: Client) {
    if (client.sessionId !== this.hostId) return;
    if (this.state.phase !== "waiting") return;
    if (this.state.players.size < 1) return;  // gra możliwa od 1 gracza
    this.startCountdown();
  }

  // ── Cykl wyścigu ─────────────────────────────────────────────────────────

  private startCountdown() {
    this.state.phase     = "countdown";
    this.state.countdown = CONFIG.COUNTDOWN_SECONDS;

    const tick = setInterval(() => {
      this.state.countdown--;
      if (this.state.countdown <= 0) {
        clearInterval(tick);
        this.startRace();
      }
    }, 1000);
  }

  private startRace() {
    this.state.phase      = "racing";
    this.state.raceNumber++;
    this.finishCounter    = 0;
    this.lobbySize        = this.state.players.size;

    // Generuj mapę
    const seed   = Math.floor(Math.random() * 0xFFFFFF);
    const layout = MapGenerator.generate(seed);

    // Rozstaw graczy na starcie
    let i = 0;
    this.state.players.forEach((player) => {
      player.x           = (2 + i) * CONFIG.TILE_SIZE;
      player.y           = (CONFIG.LEVEL_HEIGHT_TILES - 3) * CONFIG.TILE_SIZE;
      player.vx          = 0;
      player.vy          = 0;
      player.lives       = CONFIG.STARTING_LIVES;
      player.raceScore   = 0;
      player.finished    = false;
      player.eliminated  = false;
      player.grounded    = false;
      player.checkpointX = player.x;
      player.lastInput   = { left: false, right: false, jump: false, seq: 0 };
      i++;
    });

    // Wróg — inicjalizacja przez EnemyAI (spec-05)
    this.state.enemies.splice(0);
    EnemyAI.spawnEnemies(layout.enemySpawns, this.state.enemies);

    // Broadcast mapy do klientów
    const mapMsg: MapLayoutMessage = {
      type:        "map_layout",
      seed,
      tiles:       layout.tiles,
      enemySpawns: layout.enemySpawns,
      finishX:     layout.finishX,
      raceNumber:  this.state.raceNumber,
    };
    this.broadcast("map_layout", mapMsg);

    // Uruchom pętlę fizyki
    const dt = 1 / CONFIG.PHYSICS_TICK_RATE;
    this.physicsInterval = setInterval(() => {
      PhysicsEngine.tick(this.state, layout.tiles, layout.finishX, dt, this);
      EnemyAI.tick(this.state.enemies, layout.tiles, dt);
    }, 1000 / CONFIG.PHYSICS_TICK_RATE);
  }

  // Wywoływane przez PhysicsEngine (spec-04) gdy gracz kończy wyścig
  public finishPlayer(playerId: string) {
    const player = this.state.players.get(playerId);
    if (!player || player.finished || player.eliminated) return;

    this.finishCounter++;
    const points      = Math.max(this.lobbySize - (this.finishCounter - 1), 1);
    player.raceScore  = points;
    player.totalScore += points;
    player.finished   = true;

    this.checkRaceEnd();
  }

  // Wywoływane przez PhysicsEngine gdy gracz jest eliminowany
  public eliminatePlayer(playerId: string) {
    const player = this.state.players.get(playerId);
    if (!player) return;
    player.eliminated = true;
    player.raceScore  = 0;
    this.broadcast("player_eliminated", { playerId });
    this.checkRaceEnd();
  }

  private checkRaceEnd() {
    const active = [...this.state.players.values()].filter(
      (p) => !p.finished && !p.eliminated
    );
    if (active.length === 0) this.endRace();
  }

  public endRace() {
    if (this.physicsInterval) {
      clearInterval(this.physicsInterval);
      this.physicsInterval = null;
    }
    this.state.phase = "results";

    const results = [...this.state.players.values()].map((p) => ({
      playerId:     p.id,
      name:         p.name,
      position:     p.finished ? (p.raceScore > 0 ? this.lobbySize - p.raceScore + 1 : 0) : 0,
      pointsEarned: p.raceScore,
      totalScore:   p.totalScore,
    }));

    this.broadcast("race_result", { type: "race_result", results });

    // Powrót do "waiting" po 8 sekundach
    setTimeout(() => {
      if (this.state.phase === "results") {
        this.state.phase = "waiting";
      }
    }, 8000);
  }
}
```

---

## Kontrakty eksportowane (do użytku przez spec-04, spec-05)

Inne moduły serwerowe potrzebują referencji do `GameRoom` tylko przez te metody:

```typescript
// Interfejs widoczny dla PhysicsEngine
interface IGameRoomCallbacks {
  finishPlayer(playerId: string):    void;
  eliminatePlayer(playerId: string): void;
}
```

`PhysicsEngine` i `EnemyAI` przyjmują `IGameRoomCallbacks` jako parametr `tick()` — nie importują `GameRoom` bezpośrednio, co zapobiega cyklicznym zależnościom.

---

## Uwagi

- `MapGenerator.generate(seed)` zwraca `{ tiles: number[], enemySpawns: EnemySpawn[], finishX: number }` — zdefiniowane w spec-03.
- `PhysicsEngine.tick(...)` i `EnemyAI.tick(...)` / `EnemyAI.spawnEnemies(...)` — interfejsy zdefiniowane w spec-04 i spec-05.
- Kolorowanie graczy jest deterministyczne (join order). Gdy gracz odchodzi, kolor **nie** jest realokowany do istniejących graczy — nowy gracz dostaje kolor według aktualnego `players.size`.
