# Spec 07 — Client Network Layer (ColyseusClient)

**Zależności**: spec-00 (typy wiadomości, IGameState), spec-01 (VITE_SERVER_URL)  
**Równolegle z**: spec-02, spec-03, spec-04, spec-05, spec-06, spec-08  
**Wymagane przez**: spec-06 (LobbyUI), spec-08 (GameScene)

## Plik do stworzenia

- `client/src/network/ColyseusClient.ts`

---

## Odpowiedzialność

Singleton zarządzający całym połączeniem Colyseus:
- Połączenie z serwerem
- Pobieranie listy pokoi
- Tworzenie / dołączanie / opuszczanie pokoju
- Wysyłanie wejścia gracza (input)
- Odbieranie wiadomości pokoju i delegowanie callbacków
- Udostępnianie bieżącego stanu gry dla GameScene i LobbyUI

---

## Interfejs publiczny

```typescript
export const ColyseusClient = {
  // Stan
  sessionId:    string,
  currentRoom:  Room<GameState> | null,

  // Lobby
  connect(playerName: string): Promise<void>,
  getAvailableRooms(): Promise<RoomAvailable[]>,
  createRoom(roomName: string, maxPlayers: number): Promise<void>,
  joinRoom(roomId: string): Promise<void>,
  leaveRoom(): Promise<void>,
  isHost(): boolean,

  // Wyścig
  startRace(): void,
  sendInput(input: InputMessage): void,

  // Callbacki (ustawiane przez konsumentów)
  onRoomStateChange(cb: (state: IGameState) => void): void,
  onRaceStart(cb: (msg: MapLayoutMessage) => void): void,
  onRaceResult(cb: (msg: RaceResultMessage) => void): void,
  onPlayerEliminated(cb: (data: { playerId: string }) => void): void,
};
```

---

## Pełna implementacja

```typescript
import Colyseus, { Client, Room, RoomAvailable } from "colyseus.js";
import type {
  IGameState,
  InputMessage,
  MapLayoutMessage,
  RaceResultMessage,
} from "@shared/types";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "ws://localhost:2567";

class ColyseusClientImpl {
  private client:   Client       = new Client(SERVER_URL);
  private room:     Room | null  = null;
  private hostId:   string       = "";
  private _name:    string       = "";

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
      name:       this._name,
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

  private _onStateChange:      ((s: IGameState) => void)              = () => {};
  private _onRaceStart:        ((m: MapLayoutMessage) => void)        = () => {};
  private _onRaceResult:       ((m: RaceResultMessage) => void)       = () => {};
  private _onPlayerEliminated: ((d: { playerId: string }) => void)    = () => {};

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
```

---

## Uwaga o `hostId`

Serwer (GameRoom spec-02) musi wysyłać aktualny `hostId` po każdej zmianie hosta. Dodaj do `GameRoom.onJoin` i `GameRoom.onLeave`:

```typescript
// W GameRoom (spec-02), po każdej zmianie hostId:
this.broadcast("host_id", { hostId: this.hostId });
// Lub bezpośrednio do nowego klienta po dołączeniu:
client.send("host_id", { hostId: this.hostId });
```

---

## Wysyłanie inputu — throttling

GameScene (spec-08) wywołuje `sendInput` w pętli `update()` (60fps). Throttling do 20Hz jest realizowany przez GameScene:

```typescript
// W GameScene.update():
this.inputAccumulator += delta;
if (this.inputAccumulator >= 50 || inputChanged) {  // 50ms = 20Hz
  ColyseusClient.sendInput(currentInput);
  this.inputAccumulator = 0;
}
```

`ColyseusClient.sendInput` nie robi własnego throttlingu — wysyła natychmiast.

---

## Typy Colyseus

`Room<GameState>` z `colyseus.js` — klient używa `IGameState` z `@shared/types` do typowania callbacków. Rzutowanie `state as unknown as IGameState` jest konieczne bo Colyseus Schema nie implementuje bezpośrednio interfejsów.

---

## Uwagi

- Singleton — jeden import `ColyseusClient` w całej aplikacji klienckiej.
- `onRoomStateChange` można wywołać wiele razy (LobbyUI i GameScene mogą nadpisać callback). W praktyce: LobbyUI używa go na ekranie room, GameScene podmienia go po starcie wyścigu.
- Nie obsługuje reconnect — przy utracie połączenia użytkownik wraca do landing (scope out).
