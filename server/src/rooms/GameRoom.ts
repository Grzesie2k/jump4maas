import { Room, Client } from "colyseus";
import { GameState, PlayerState } from "../state/GameState";
import { CONFIG } from "../config";
import type { InputMessage, StartRaceMessage, MapLayoutMessage } from "@shared/types";
// Implementations provided by spec-03, spec-04, spec-05:
import { MapGenerator } from "../game/MapGenerator";
import { PhysicsEngine, IGameRoomCallbacks } from "../game/PhysicsEngine";
import { EnemyAI } from "../game/EnemyAI";

export class GameRoom extends Room<GameState> implements IGameRoomCallbacks {
  private hostId:           string = "";
  private finishCounter:    number = 0;
  private lobbySize:        number = 0;  // maxPlayers at race start
  private physicsInterval:  ReturnType<typeof setInterval> | null = null;

  onCreate(options: { roomName: string; maxPlayers: number }) {
    this.setState(new GameState());
    this.state.roomName   = options.roomName ?? "Room";
    this.state.maxPlayers = Math.min(Math.max(options.maxPlayers ?? 2, 2), CONFIG.MAX_PLAYERS);
    this.maxClients = this.state.maxPlayers;
    this.setMetadata({ phase: "waiting", roomName: this.state.roomName });

    this.onMessage("input",      (client, msg: InputMessage)     => this.handleInput(client, msg));
    this.onMessage("start_race", (client, _msg: StartRaceMessage) => this.handleStartRace(client));
    this.onMessage("leave_room", (client, _msg)                   => client.leave());
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
      this.broadcast("host_id", { hostId: this.hostId });
    }

    // Send current host to joining client
    client.send("host_id", { hostId: this.hostId });

    // Auto-start when room is full
    if (this.state.players.size === this.state.maxPlayers && this.state.phase === "waiting") {
      this.startCountdown();
    }
  }

  onLeave(client: Client, _consented: boolean) {
    this.state.players.delete(client.sessionId);

    if (client.sessionId === this.hostId) {
      const next = this.state.players.keys().next().value;
      this.hostId = next ?? "";
      this.broadcast("host_id", { hostId: this.hostId });
    }

    // If race is in progress and too few players — end the race
    if (this.state.phase === "racing" && this.state.players.size < 1) {
      this.endRace();
    }
  }

  onDispose() {
    if (this.physicsInterval) clearInterval(this.physicsInterval);
  }

  // ── Message handlers ────────────────────────────────────────────────────────

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
    if (this.state.players.size < 1) return;
    this.startCountdown();
  }

  // ── Race lifecycle ──────────────────────────────────────────────────────────

  private startCountdown() {
    this.state.phase     = "countdown";
    this.state.countdown = CONFIG.COUNTDOWN_SECONDS;
    this.setMetadata({ phase: "countdown", roomName: this.state.roomName });

    const tick = setInterval(() => {
      this.state.countdown--;
      if (this.state.countdown <= 0) {
        clearInterval(tick);
        this.startRace();
      }
    }, 1000);
  }

  private startRace() {
    this.state.phase   = "racing";
    this.state.raceNumber++;
    this.setMetadata({ phase: "racing", roomName: this.state.roomName });
    this.finishCounter = 0;
    this.lobbySize     = this.state.players.size;

    // Generate map
    const seed   = Math.floor(Math.random() * 0xFFFFFF);
    const layout = MapGenerator.generate(seed);

    // Spawn players at start
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

    // Enemies — initialized by EnemyAI (spec-05)
    this.state.enemies.splice(0);
    EnemyAI.spawnEnemies(layout.enemySpawns, this.state.enemies, layout.tiles);

    // Broadcast map to clients
    const mapMsg: MapLayoutMessage = {
      type:        "map_layout",
      seed,
      tiles:       layout.tiles,
      enemySpawns: layout.enemySpawns,
      finishX:     layout.finishX,
      raceNumber:  this.state.raceNumber,
    };
    this.broadcast("map_layout", mapMsg);

    // Start physics loop
    const dt = 1 / CONFIG.PHYSICS_TICK_RATE;
    this.physicsInterval = setInterval(() => {
      PhysicsEngine.tick(this.state, layout.tiles, layout.finishX, dt, this);
      EnemyAI.tick(this.state.enemies, layout.tiles, dt);
    }, 1000 / CONFIG.PHYSICS_TICK_RATE);
  }

  // Called by PhysicsEngine (spec-04) when a player finishes the race
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

  // Called by PhysicsEngine when a player is eliminated
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
    this.setMetadata({ phase: "results", roomName: this.state.roomName });

    const results = [...this.state.players.values()].map((p) => ({
      playerId:     p.id,
      name:         p.name,
      position:     p.finished ? (p.raceScore > 0 ? this.lobbySize - p.raceScore + 1 : 0) : 0,
      pointsEarned: p.raceScore,
      totalScore:   p.totalScore,
    }));

    this.broadcast("race_result", { type: "race_result", results });

    // Return to "waiting" after 8 seconds
    setTimeout(() => {
      if (this.state.phase === "results") {
        this.state.phase = "waiting";
        this.setMetadata({ phase: "waiting", roomName: this.state.roomName });
      }
    }, 8000);
  }
}
