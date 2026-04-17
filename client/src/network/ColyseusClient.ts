import { Client, Room, RoomAvailable } from "colyseus.js";
import type {
  IGameState,
  InputMessage,
  MapLayoutMessage,
  RaceResultMessage,
} from "@shared/types";

const { protocol, host } = window.location;
const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ??
  `${protocol.replace("http", "ws")}//${host}`;

class ColyseusClientImpl {
  private client: Client      = new Client(SERVER_URL);
  private room:   Room | null = null;
  private hostId: string      = "";
  private _name:  string      = "";

  // ── Public state ──────────────────────────────────────────────────────────

  get sessionId(): string { return this.room?.sessionId ?? ""; }
  get currentRoom(): Room | null { return this.room; }

  isHost(): boolean { return this.sessionId === this.hostId; }

  // ── Połączenie ────────────────────────────────────────────────────────────

  async connect(playerName: string): Promise<void> {
    this._name = playerName;
    // Nie tworzymy połączenia tutaj — Colyseus łączy się przy joinOrCreate
  }

  async getAvailableRooms(): Promise<RoomAvailable[]> {
    return this.client.getAvailableRooms("game_room");
  }

  async createRoom(roomName: string, maxPlayers: number): Promise<void> {
    this.room = await this.client.create("game_room", {
      name: this._name,
      roomName,
      maxPlayers,
    });
    this.hostId = this.room.sessionId;
    this.bindRoomMessages();
  }

  async joinRoom(roomId: string): Promise<void> {
    this.room = await this.client.joinById(roomId, { name: this._name });
    this.bindRoomMessages();
  }

  async leaveRoom(): Promise<void> {
    if (this.room) {
      await this.room.leave();
      this.room   = null;
      this.hostId = "";
    }
  }

  // ── Akcje w pokoju ────────────────────────────────────────────────────────

  startRace(): void {
    this.room?.send("start_race", { type: "start_race" });
  }

  sendInput(input: InputMessage): void {
    this.room?.send("input", input);
  }

  // ── Callbacki ─────────────────────────────────────────────────────────────

  private _onStateChange:      (s: IGameState) => void              = () => {};
  private _onRaceStart:        (m: MapLayoutMessage) => void        = () => {};
  private _onRaceResult:       (m: RaceResultMessage) => void       = () => {};
  private _onPlayerEliminated: (d: { playerId: string }) => void    = () => {};

  onRoomStateChange(cb: (s: IGameState) => void): void {
    this._onStateChange = cb;
    // Jeśli pokój już istnieje, podepnij natychmiast
    this.room?.onStateChange((state) => cb(state as unknown as IGameState));
  }

  onRaceStart(cb: (m: MapLayoutMessage) => void): void {
    this._onRaceStart = cb;
  }

  onRaceResult(cb: (m: RaceResultMessage) => void): void {
    this._onRaceResult = cb;
  }

  onPlayerEliminated(cb: (d: { playerId: string }) => void): void {
    this._onPlayerEliminated = cb;
  }

  // ── Wewnętrzne bindowanie wiadomości ──────────────────────────────────────

  private bindRoomMessages(): void {
    if (!this.room) return;

    this.room.onStateChange((state) =>
      this._onStateChange(state as unknown as IGameState)
    );

    this.room.onMessage("map_layout", (msg: MapLayoutMessage) =>
      this._onRaceStart(msg)
    );

    this.room.onMessage("race_result", (msg: RaceResultMessage) =>
      this._onRaceResult(msg)
    );

    this.room.onMessage("player_eliminated", (data: { playerId: string }) =>
      this._onPlayerEliminated(data)
    );

    // Odczytaj hostId z metadata po dołączeniu
    this.room.onMessage("host_id", (data: { hostId: string }) => {
      this.hostId = data.hostId;
    });

    // Obsługa rozłączenia
    this.room.onLeave((code) => {
      console.warn("Left room, code:", code);
    });
  }
}

export const ColyseusClient = new ColyseusClientImpl();
