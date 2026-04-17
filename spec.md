# Multiplayer Browser Platformer — Build Specification

## Overview

A real-time multiplayer platformer game that runs entirely in the browser. Up to 5 players race through a procedurally generated Mario-style level simultaneously. No accounts, no persistence, no downloads — players enter a name and play.

---

## Technology Stack

| Layer | Choice | Reason |
|---|---|---|
| **Game rendering** | Phaser 3 | Purpose-built 2D web game framework, handles tilemaps, sprites, input, cameras natively |
| **Multiplayer server** | Colyseus 0.15 | Built specifically for multiplayer games — handles rooms, state sync, and matchmaking out of the box |
| **Server runtime** | Node.js + TypeScript | Required by Colyseus; type safety prevents networking bugs |
| **Build tool** | Vite | Fast HMR, handles both client and TypeScript compilation |
| **Transport** | WebSockets (via Colyseus) | Built in, handles reconnection and serialization |
| **Physics** | Custom (server-side) | Simple AABB platformer physics — no library needed, keeps the server lightweight |

Do **not** use a client-side physics engine. The server is authoritative for all positions, collisions, and game state. Clients render interpolated state only.

---

## Project Structure

```
/
├── client/
│   ├── src/
│   │   ├── main.ts               # Phaser game bootstrap
│   │   ├── scenes/
│   │   │   ├── BootScene.ts      # Preload assets
│   │   │   ├── LobbyScene.ts     # Name entry + room list
│   │   │   ├── RoomScene.ts      # Waiting room / player list
│   │   │   ├── GameScene.ts      # The platformer
│   │   │   └── ResultsScene.ts   # Post-race scoreboard
│   │   ├── network/
│   │   │   └── ColyseusClient.ts # Singleton client, room ref
│   │   └── game/
│   │       ├── MapRenderer.ts    # Renders tilemap from server layout
│   │       ├── PlayerSprite.ts   # Local + remote player rendering
│   │       └── Interpolator.ts   # Smooths remote player positions
│   ├── assets/
│   │   ├── tiles/                # Tileset PNG (ground, platform, finish, decoration)
│   │   ├── player/               # Player spritesheet (idle, run-left, run-right, fall, die)
│   │   └── enemy/                # Enemy spritesheet (walk-left, walk-right)
│   ├── index.html
│   └── vite.config.ts
│
├── server/
│   ├── src/
│   │   ├── index.ts              # Colyseus server bootstrap (port 2567)
│   │   ├── rooms/
│   │   │   └── GameRoom.ts       # Main Colyseus room
│   │   ├── state/
│   │   │   └── GameState.ts      # Colyseus Schema definitions
│   │   ├── game/
│   │   │   ├── PhysicsEngine.ts  # Server-side AABB physics tick
│   │   │   ├── MapGenerator.ts   # Procedural level generator
│   │   │   └── EnemyAI.ts        # Enemy patrol logic
│   │   └── config.ts             # Game constants
│   └── tsconfig.json
│
└── package.json                  # Workspace root (npm workspaces)
```

---

## Screens & Game Flow

```
[Landing Page]
  → Enter display name (required, 2–16 chars)
  → Click "Play"

[Lobby Screen]
  → Shows list of open rooms (name, players joined / max players, status)
  → Button: "Create Room"
    → Enter room name, select max players (2–5)
  → Click any room to join it
  → Rooms in "racing" state are shown as spectatable but not joinable

[Room Screen]
  → Shows room name, list of players (color dot + name)
  → Shows cumulative leaderboard (name + total points across all races)
  → Host sees "Start Race" button (disabled until min 2 players present)
    → Alternatively: auto-start when the room reaches max players
  → All players see a "Leave Room" button
  → Host is the first player to create the room

[Game Screen — The Race]
  → Countdown 3-2-1-GO before movement unlocks
  → Each player's camera follows their own character
  → HUD (top of screen):
    → Player name + 3 heart icons (dim hearts = lost lives)
    → Minimap strip showing all players' X positions along the level
    → Current race standings (1st, 2nd, etc. updated in real time)
  → When a player finishes or is eliminated, they enter spectator mode
    → Camera switches to the leading remaining player
    → Their row in standings is locked

[Results Screen]
  → Shows race result (finishing order + points earned this race)
  → Shows updated total leaderboard
  → Auto-returns to Room Screen after 8 seconds
  → Players can run as many races as they want
  → Each race uses a new randomly generated map

[Room Screen — between races]
  → Updated leaderboard visible
  → Host can start next race at any time (min 2 players)
```

---

## Player Rules

- Movement: **left arrow / A** = run left, **right arrow / D** = run right, **up arrow / W / Space** = jump
- Jump is only allowed when standing on a surface (no double-jump)
- Player character is a ~32×48px humanoid sprite tinted with the player's assigned color
- Each player is assigned a **color at join time** from a fixed palette of 5 distinct colors:
  `#E74C3C` (red), `#3498DB` (blue), `#2ECC71` (green), `#F39C12` (orange), `#9B59B6` (purple)
  Colors are assigned in join order and freed when a player leaves
- A floating name label renders above each player sprite at all times
- Players are **visually independent** — they pass through each other (no player-to-player collision)

### Lives

- Each player starts a race with **3 lives**
- A life is lost when:
    - The player **touches an enemy** (any part of the enemy's hitbox)
    - The player **falls below the bottom of the level** (off-screen bottom)
- On life loss: character plays a death animation, respawns at the **last safe ground tile they stood on** (checkpoint system — server tracks last grounded X position every 2 seconds). If no checkpoint exists yet, respawn at start.
- At **0 lives**: player is eliminated. They enter spectator mode and receive **0 points** for this race regardless of progress.
- Enemies **cannot be killed** under any circumstances.

### Finishing

- The level ends with a clearly marked **finish line** (flag + vertical striped tile column)
- When a player's hitbox crosses the finish line X coordinate, they finish
- Finishing order determines points (see Scoring)

---

## Scoring System

- Points are awarded **per race**, not per life
- Let **N** = room's configured max player count (not affected by mid-race disconnects — use the lobby size at race start)
- Finishing positions:

| Position | Points |
|---|---|
| 1st | N |
| 2nd | N − 1 |
| 3rd | N − 2 |
| … | … |
| Eliminated (0 lives) | 0 |
| Did not finish (still racing when last place finishes) | 0 |

- **Total points** = sum of all races played while in the room
- Leaderboard is visible on the Room Screen and persists for the lifetime of the room
- When all players in a room leave, the room and all scores are destroyed (no persistence)

---

## Map Generation

Maps are generated **server-side** at the start of each race. The full tile layout is sent to all clients as a flat JSON array. Clients never generate maps — they only render the layout they receive.

### Level Dimensions

- **Width**: 280 tiles
- **Height**: 18 tiles
- **Tile size**: 32×32 px (level is 8960 × 576 px)
- Camera viewport: 800×576 (the visible area scrolls horizontally)

### Tile Types

```typescript
enum Tile {
  Empty     = 0,
  Ground    = 1,  // solid, brown/stone texture
  Platform  = 2,  // solid, wooden texture (one-way: passable from below)
  Finish    = 3,  // finish line tiles (decorative, not solid)
  Decoration = 4, // bush/cloud/background detail (not solid)
}
```

### Generation Algorithm

Use a seeded pseudo-random number generator (pass the seed to clients so they can verify locally if needed).

1. **Base ground layer**: Fill the bottom 2 rows (rows 16–17) with Ground tiles for the first 10 tiles (safe start zone) and the last 10 tiles (safe finish zone).

2. **Middle ground segments**: For tiles 10 to 270, generate ground in alternating **segments** and **gaps**:
    - Segment length: random 4–14 tiles of Ground
    - Gap length: random 2–5 tiles of Empty (hole)
    - Constraint: never place two gaps within 3 tiles of each other
    - Constraint: ensure every gap is jumpable (max gap width = 5 tiles; player jump covers ~6 tiles horizontally)

3. **Platforms**: For each ground segment longer than 6 tiles, randomly (60% chance) add 1–2 floating platforms:
    - Platform length: 3–7 tiles
    - Height: 3–5 tiles above the ground segment below
    - Platforms use tile type `Platform` (one-way — player can jump through from below, lands on top)

4. **Enemies**: Place enemies on ground segments and platforms:
    - One enemy per 20 tiles on average (random distribution)
    - Each enemy is placed at least 3 tiles from a gap edge
    - Enemy patrol range: the segment or platform it's placed on (turns around at edges)
    - Never place enemies in the first 15 tiles (safe start zone)

5. **Finish line**: Columns 270–279 are always solid ground. Column 271 is marked as `Finish` tiles (full height). A flag sprite is rendered on top.

6. **Decoration**: Randomly scatter decoration tiles (bushes, clouds) in the background layer — purely visual, not solid.

### Enemy Specification

- Enemy sprite: a simple creature (slime or goomba-style), ~28×28 px
- Movement: constant speed of 60 px/s, reverses on hitting a wall tile or reaching a platform edge
- Hitbox: 24×24 px centered on the sprite (slightly smaller than visual)
- Enemies are **fully server-simulated** — their positions are included in the game state broadcast

---

## Server-Side Physics

Run a physics tick at **20 Hz** (every 50ms). On each tick:

### Player Physics Constants (server `config.ts`)

```typescript
const GRAVITY          = 1800;  // px/s²
const JUMP_VELOCITY    = -620;  // px/s (negative = up)
const MOVE_SPEED       = 220;   // px/s horizontal
const TILE_SIZE        = 32;
const PLAYER_W         = 24;    // hitbox width
const PLAYER_H         = 40;    // hitbox height
```

### Per Tick (for each alive player)

1. Read latest input state received from the client (left, right, jump booleans)
2. Apply horizontal velocity: `vx = input.left ? -MOVE_SPEED : input.right ? MOVE_SPEED : 0`
3. Apply gravity: `vy += GRAVITY * dt`
4. If `input.jump && player.grounded`: `vy = JUMP_VELOCITY`, `grounded = false`
5. Move player by `(vx * dt, vy * dt)`
6. Resolve tile collisions (AABB sweep against Ground and Platform tiles)
    - Platform tiles: only resolve collision when player is moving downward and was above the platform top edge in the previous frame
7. Set `player.grounded = true` if resolved a downward collision this frame
8. If `player.y > LEVEL_HEIGHT_PX + 64`: player fell into hole → call `loseLife(player)`
9. Check player AABB against each enemy AABB → if overlapping: call `loseLife(player)`
10. Check player X against finish line X → if crossed: call `finishRace(player)`
11. Update last-safe-checkpoint every 2 seconds if `player.grounded`

### `loseLife(player)`
- Decrement lives
- If lives === 0: mark player as eliminated, emit `player_eliminated` event
- Otherwise: teleport player to last checkpoint, reset `vy = 0`, keep `vx = 0`

### `finishRace(player)`
- Record finishing position (increment `finishCounter`)
- Award points: `N - (finishCounter - 1)` where N = lobby size at race start
- Mark player as finished
- If all non-eliminated players have finished: end race, broadcast results

---

## Colyseus State Schema

```typescript
// server/src/state/GameState.ts

class PlayerState extends Schema {
  @type("string")  id: string;
  @type("string")  name: string;
  @type("string")  color: string;
  @type("float32") x: number;
  @type("float32") y: number;
  @type("float32") vx: number;
  @type("float32") vy: number;
  @type("int8")    lives: number = 3;
  @type("int16")   totalScore: number = 0;
  @type("int16")   raceScore: number = 0;
  @type("boolean") grounded: boolean = false;
  @type("boolean") finished: boolean = false;
  @type("boolean") eliminated: boolean = false;
  @type("boolean") facingRight: boolean = true;
}

class EnemyState extends Schema {
  @type("uint8")   id: number;
  @type("float32") x: number;
  @type("float32") y: number;
  @type("boolean") facingRight: boolean = true;
}

class GameState extends Schema {
  @type("string")                  phase: string = "waiting"; // waiting | countdown | racing | results
  @type({ map: PlayerState })      players = new MapSchema<PlayerState>();
  @type([ EnemyState ])            enemies = new ArraySchema<EnemyState>();
  @type("int8")                    countdown: number = 0;
  @type("int8")                    maxPlayers: number = 2;
  @type("string")                  roomName: string = "";
  @type("int8")                    raceNumber: number = 0;
  // Map layout is sent once via room message, not in schema (too large for schema sync)
}
```

### Client → Server Messages

```typescript
// Input sent at ~20 Hz (client polls keyboard state and sends)
type InputMessage = {
  left: boolean;
  right: boolean;
  jump: boolean;
  seq: number; // incrementing sequence number for ordering
}

// Host only
type StartRaceMessage = { type: "start_race" }
type LeaveRoomMessage = { type: "leave_room" }
```

### Server → Client Messages (room messages, not schema)

```typescript
// Sent once when race starts — not in schema to avoid per-tick sync overhead
type MapLayoutMessage = {
  type: "map_layout";
  seed: number;
  tiles: number[];           // flat array, row-major, width*height elements
  enemySpawns: { x: number; y: number }[];
  finishX: number;
  raceNumber: number;
}

type RaceResultMessage = {
  type: "race_result";
  results: { playerId: string; name: string; position: number; pointsEarned: number; totalScore: number }[];
}
```

---

## Client Rendering (Phaser 3)

### GameScene responsibilities

1. **On `map_layout` message**: call `MapRenderer.build(layout)` which creates a Phaser `StaticGroup` of tile sprites from the flat array. Store `finishX` for local reference.

2. **Input loop** (`update()` at 60fps):
    - Read cursor keys / WASD
    - If input changed since last send OR 50ms have elapsed: send `InputMessage` to server
    - Locally apply the same movement to the **local player sprite** immediately (client-side prediction) so movement feels instant
    - Server corrections: if server position differs from predicted position by >16px, snap to server position with a brief lerp (100ms)

3. **State sync** (on Colyseus `onChange`):
    - For each remote player: update `Interpolator` target position
    - For each enemy: update `Interpolator` target position
    - Update HUD hearts, standings, minimap

4. **Camera**: `this.cameras.main.startFollow(localPlayerSprite)` with bounds set to level width. Camera does not follow Y (level is single-height scroll).

5. **Player sprites** (`PlayerSprite.ts`):
    - One sprite per player (local + remote)
    - Spritesheet with animations: `idle`, `run`, `jump`, `fall`, `die`
    - Tint applied using player color
    - Name label: `Phaser.GameObjects.Text` offset 12px above sprite, same color as player, always faces camera (no flip)
    - On elimination: play `die` animation, fade out over 500ms, render ghost (50% opacity) that follows server position so spectators can still see them

6. **Remote player interpolation** (`Interpolator.ts`):
    - Buffer last 2 server positions with timestamps
    - Render at `serverTime - 100ms` using linear interpolation between buffered positions
    - This smooths out 20Hz server ticks to 60fps visuals

### HUD Layout

```
┌──────────────────────────────────────────────┐
│ ♥ ♥ ♥  PlayerName            1st  2nd  3rd  │  ← top bar (height 40px)
│                                              │
│         [  GAME WORLD  ]                     │
│                                              │
│ ══════════════════════════════════════════   │  ← minimap strip (height 12px, bottom)
│   ● ●      ●                            ▐▌   │    colored dots = players, flag = finish
└──────────────────────────────────────────────┘
```

- Hearts: filled = alive, hollow = lost
- Race standings (top right): updated each time a player finishes
- Minimap: shows relative X progress of all players + finish flag icon

---

## Visual & Asset Guidelines

Keep assets simple — the game should look clean, not placeholder. Use a **16-bit pixel art** aesthetic.

- **Tileset**: single 192×32 PNG with 6 tiles in one row: Ground-top, Ground-fill, Platform, Finish, Bush-deco, Cloud-deco
- **Player spritesheet**: 48×48 px per frame, 5 frames per animation row: idle(1), run(4), jump(1), fall(1), die(3)
- **Enemy spritesheet**: 32×32 px per frame, walk-left(2), walk-right(2)
- **Background**: solid sky blue gradient, static (no parallax needed)

If you cannot source pixel art assets during generation, use **Phaser Graphics primitives** as placeholders:
- Tiles: colored rectangles with a 1px darker border
- Player: colored rectangle (24×40) with a small circle head (12px radius) on top, tinted with player color
- Enemy: red rectangle (28×28) with two white eyes

---

## Lobby UI (HTML/CSS — not Phaser)

The lobby and room screens are **plain HTML/CSS** rendered on top of (or instead of) the Phaser canvas. Use a simple CSS class `hidden` to toggle between screens. No framework needed — vanilla DOM.

### Screens

**Landing (`#screen-landing`)**
```
[ Platformer Party ]

Your name: [____________]  (max 16 chars)
           [  Play  ]
```

**Lobby (`#screen-lobby`)**
```
[ Platformer Party ]    Playing as: RedPlayer

  Available Rooms                    [ + Create Room ]
  ┌────────────────────────────────────────────────┐
  │  Room Name           Players    Status         │
  │  CoolRoom            2 / 4      Waiting   Join │
  │  FastRacers          5 / 5      Racing         │
  └────────────────────────────────────────────────┘
                                    [ Refresh ]
```

**Create Room modal**
```
Room name: [____________]
Max players: ( 2 ) ( 3 ) ( 4 ) ( 5 )
             [ Create ]  [ Cancel ]
```

**Room (`#screen-room`)**
```
[ CoolRoom ]  2 / 4 players      [ Leave ]

  Players                 Total Points
  ● RedPlayer  (you)           12
  ● BluePlayer                  8
  ○ (waiting...)
  ○ (waiting...)

  Leaderboard updates after each race.

  [host only]  [ Start Race ]
               (need 2+ players)
```

---

## Server Bootstrap & Deployment Notes

```typescript
// server/src/index.ts
import { Server } from "colyseus";
import { GameRoom } from "./rooms/GameRoom";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import { createServer } from "http";

const app = express();
app.use(express.static("../client/dist")); // serve built client

const httpServer = createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });

gameServer.define("game_room", GameRoom).enableRealtimeListing();

httpServer.listen(2567, () => console.log("Server running on :2567"));
```

- Client WebSocket connects to `ws://[host]:2567`
- For local dev: client uses `ws://localhost:2567`
- For production: use an env variable `VITE_SERVER_URL` in the client
- No database, no file storage, no auth — the server is fully stateless between runs

---

## Game Constants Reference (`server/src/config.ts`)

```typescript
export const CONFIG = {
  // Physics
  GRAVITY:           1800,   // px/s²
  JUMP_VELOCITY:     -620,   // px/s
  MOVE_SPEED:        220,    // px/s
  PLAYER_W:          24,     // hitbox width px
  PLAYER_H:          40,     // hitbox height px
  ENEMY_SPEED:       60,     // px/s
  ENEMY_W:           24,     // enemy hitbox width
  ENEMY_H:           24,     // enemy hitbox height

  // Game rules
  MAX_PLAYERS:       5,
  STARTING_LIVES:    3,
  CHECKPOINT_INTERVAL_MS: 2000,

  // Level
  TILE_SIZE:         32,
  LEVEL_WIDTH_TILES: 280,
  LEVEL_HEIGHT_TILES: 18,

  // Server tick
  PHYSICS_TICK_RATE: 20,     // Hz

  // Countdown
  COUNTDOWN_SECONDS: 3,

  // Colors (assigned in join order)
  PLAYER_COLORS: ["#E74C3C", "#3498DB", "#2ECC71", "#F39C12", "#9B59B6"],
} as const;
```

---

## Implementation Order (Suggested)

1. **Server skeleton**: Colyseus server up, `GameRoom` with schema, echo back state — confirm WebSocket connects
2. **Client skeleton**: Phaser boots, connects to Colyseus, receives state — confirm state flows
3. **Lobby UI**: Landing → create/join room → room screen (HTML only, no game yet)
4. **Map generation**: `MapGenerator` produces a valid level, send to client, client renders tiles
5. **Server physics**: Player moves based on input messages, gravity, tile collision
6. **Client rendering**: Player sprites, camera, remote interpolation
7. **Enemy AI**: Server-side patrol, client renders enemies from state
8. **Life system**: Death detection, respawn, elimination
9. **Finish line + scoring**: Race completion, points, results screen
10. **Polish**: Animations, HUD, minimap, countdown, sounds (optional)

---

## Out of Scope

- Sound effects / music (can be added but not required)
- Mobile / touch controls
- Spectator mode beyond passive camera follow
- Replay or history
- Chat
- Account system, login, persistent storage of any kind
- Room passwords or invite codes
- Kicking players
