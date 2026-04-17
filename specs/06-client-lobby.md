# Spec 06 — Client Lobby UI (HTML/CSS/DOM)

**Zależności**: spec-00 (typy wiadomości), spec-01 (index.html szkielet)  
**Równolegle z**: spec-02, spec-03, spec-04, spec-05, spec-07, spec-08  
**Integruje się z**: spec-07 (ColyseusClient — wywołania sieciowe), spec-08 (przejście do GameScene)

## Pliki do stworzenia/modyfikacji

- `client/index.html` — rozszerzenie szkieletu z spec-01 o treść ekranów
- `client/src/ui/LobbyUI.ts` — cała logika DOM lobby
- `client/src/ui/lobby.css` — style

> **Uwaga**: Ekrany lobby to **czysty HTML/CSS/DOM**, nie Phaser. Canvas Phasera jest ukryty gdy aktywny jest ekran lobby.

---

## Struktura HTML (`#ui-root` z index.html)

```html
<!-- Landing -->
<div id="screen-landing" class="screen active">
  <h1 class="title">Platformer Party</h1>
  <div class="form-group">
    <label for="input-name">Your name</label>
    <input id="input-name" type="text" maxlength="16" placeholder="Enter name..." autocomplete="off" />
    <span id="name-error" class="error hidden"></span>
  </div>
  <button id="btn-play" class="btn btn-primary">Play</button>
</div>

<!-- Lobby -->
<div id="screen-lobby" class="screen">
  <div class="lobby-header">
    <h1 class="title">Platformer Party</h1>
    <span id="lobby-playing-as">Playing as: —</span>
  </div>

  <div class="lobby-body">
    <div class="rooms-header">
      <h2>Available Rooms</h2>
      <button id="btn-create-room" class="btn btn-secondary">+ Create Room</button>
    </div>
    <table id="rooms-table">
      <thead>
        <tr><th>Room Name</th><th>Players</th><th>Status</th><th></th></tr>
      </thead>
      <tbody id="rooms-tbody">
        <!-- wypełniane dynamicznie -->
      </tbody>
    </table>
    <p id="rooms-empty" class="rooms-empty hidden">No rooms available. Create one!</p>
  </div>

  <button id="btn-refresh" class="btn btn-ghost">Refresh</button>
</div>

<!-- Create Room modal -->
<div id="modal-create-room" class="modal hidden">
  <div class="modal-box">
    <h2>Create Room</h2>
    <div class="form-group">
      <label for="input-room-name">Room name</label>
      <input id="input-room-name" type="text" maxlength="24" placeholder="Room name..." />
    </div>
    <div class="form-group">
      <label>Max players</label>
      <div class="radio-group" id="max-players-group">
        <label><input type="radio" name="max-players" value="2" checked /> 2</label>
        <label><input type="radio" name="max-players" value="3" /> 3</label>
        <label><input type="radio" name="max-players" value="4" /> 4</label>
        <label><input type="radio" name="max-players" value="5" /> 5</label>
      </div>
    </div>
    <div class="modal-actions">
      <button id="btn-modal-create" class="btn btn-primary">Create</button>
      <button id="btn-modal-cancel" class="btn btn-ghost">Cancel</button>
    </div>
  </div>
</div>

<!-- Room -->
<div id="screen-room" class="screen">
  <div class="room-header">
    <div>
      <h1 id="room-title">Room Name</h1>
      <span id="room-player-count">0 / 0 players</span>
    </div>
    <button id="btn-leave" class="btn btn-danger">Leave</button>
  </div>

  <div class="room-body">
    <div class="players-list" id="room-players-list">
      <!-- wypełniane dynamicznie -->
    </div>
    <p class="leaderboard-note">Leaderboard updates after each race.</p>
  </div>

  <div class="room-footer" id="room-footer-host" style="display:none">
    <button id="btn-start-race" class="btn btn-primary" disabled>Start Race</button>
    <p id="start-race-hint" class="hint">Need 2+ players</p>
  </div>
</div>
```

---

## `client/src/ui/LobbyUI.ts`

### Zależności zewnętrzne

```typescript
import { ColyseusClient } from "../network/ColyseusClient";  // spec-07
// ColyseusClient udostępnia:
//   connect(name): Promise<void>
//   getAvailableRooms(): Promise<RoomListing[]>
//   createRoom(name, maxPlayers): Promise<void>
//   joinRoom(roomId): Promise<void>
//   leaveRoom(): Promise<void>
//   startRace(): void
//   onRoomStateChange(cb): void    // callback gdy state pokoju się zmienia
//   onRaceStart(cb): void          // callback gdy race zaczyna się (przejście do GameScene)
```

### Klasa

```typescript
export class LobbyUI {
  private playerName: string = "";

  init(): void {
    this.bindLanding();
    this.bindLobby();
    this.bindCreateRoomModal();
    this.bindRoom();
    this.showScreen("landing");
  }

  // ── Landing ──────────────────────────────────────────────────────────────

  private bindLanding(): void {
    document.getElementById("btn-play")!.addEventListener("click", async () => {
      const input = document.getElementById("input-name") as HTMLInputElement;
      const name  = input.value.trim();
      const error = document.getElementById("name-error")!;

      if (name.length < 2 || name.length > 16) {
        error.textContent = "Name must be 2–16 characters.";
        error.classList.remove("hidden");
        return;
      }
      error.classList.add("hidden");
      this.playerName = name;

      await ColyseusClient.connect(name);
      (document.getElementById("lobby-playing-as")!).textContent = `Playing as: ${name}`;
      await this.refreshRooms();
      this.showScreen("lobby");
    });

    const input = document.getElementById("input-name") as HTMLInputElement;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") (document.getElementById("btn-play") as HTMLButtonElement).click();
    });
  }

  // ── Lobby ─────────────────────────────────────────────────────────────────

  private bindLobby(): void {
    document.getElementById("btn-create-room")!.addEventListener("click", () => {
      document.getElementById("modal-create-room")!.classList.remove("hidden");
    });

    document.getElementById("btn-refresh")!.addEventListener("click", () => this.refreshRooms());
  }

  private async refreshRooms(): Promise<void> {
    const rooms  = await ColyseusClient.getAvailableRooms();
    const tbody  = document.getElementById("rooms-tbody")!;
    const empty  = document.getElementById("rooms-empty")!;
    tbody.innerHTML = "";

    if (rooms.length === 0) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    for (const room of rooms) {
      const canJoin = room.clients < room.maxClients && room.metadata?.phase === "waiting";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(room.metadata?.roomName ?? room.roomId)}</td>
        <td>${room.clients} / ${room.maxClients}</td>
        <td><span class="badge ${canJoin ? 'badge-waiting' : 'badge-racing'}">${canJoin ? "Waiting" : "Racing"}</span></td>
        <td>${canJoin ? `<button class="btn btn-sm btn-primary" data-room-id="${room.roomId}">Join</button>` : ""}</td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll("[data-room-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const roomId = (btn as HTMLElement).dataset.roomId!;
        await ColyseusClient.joinRoom(roomId);
        this.enterRoomScreen();
      });
    });
  }

  // ── Create Room Modal ─────────────────────────────────────────────────────

  private bindCreateRoomModal(): void {
    document.getElementById("btn-modal-cancel")!.addEventListener("click", () => {
      document.getElementById("modal-create-room")!.classList.add("hidden");
    });

    document.getElementById("btn-modal-create")!.addEventListener("click", async () => {
      const nameInput  = document.getElementById("input-room-name") as HTMLInputElement;
      const roomName   = nameInput.value.trim() || "Room";
      const maxPlayers = parseInt(
        (document.querySelector('input[name="max-players"]:checked') as HTMLInputElement).value,
        10
      );
      document.getElementById("modal-create-room")!.classList.add("hidden");
      await ColyseusClient.createRoom(roomName, maxPlayers);
      this.enterRoomScreen();
    });
  }

  // ── Room ──────────────────────────────────────────────────────────────────

  private enterRoomScreen(): void {
    this.showScreen("room");
    ColyseusClient.onRoomStateChange((state) => this.updateRoomScreen(state));
    ColyseusClient.onRaceStart(() => this.hideAllScreens());  // Phaser przejmuje
  }

  private bindRoom(): void {
    document.getElementById("btn-leave")!.addEventListener("click", async () => {
      await ColyseusClient.leaveRoom();
      await this.refreshRooms();
      this.showScreen("lobby");
    });

    document.getElementById("btn-start-race")!.addEventListener("click", () => {
      ColyseusClient.startRace();
    });
  }

  private updateRoomScreen(state: import("@shared/types").IGameState): void {
    const isHost = ColyseusClient.isHost();

    (document.getElementById("room-title")!).textContent         = state.roomName;
    (document.getElementById("room-player-count")!).textContent  =
      `${state.players.size} / ${state.maxPlayers} players`;

    // Lista graczy
    const list = document.getElementById("room-players-list")!;
    list.innerHTML = "";
    const myId = ColyseusClient.sessionId;

    for (let i = 0; i < state.maxPlayers; i++) {
      const players = [...state.players.values()];
      const p       = players[i];
      const div     = document.createElement("div");
      div.className = "player-row";
      if (p) {
        div.innerHTML = `
          <span class="color-dot" style="background:${p.color}"></span>
          <span class="player-name">${escapeHtml(p.name)}${p.id === myId ? " (you)" : ""}</span>
          <span class="player-score">${p.totalScore}</span>
        `;
      } else {
        div.innerHTML = `<span class="color-dot empty"></span><span class="player-name waiting">( waiting... )</span>`;
      }
      list.appendChild(div);
    }

    // Przycisk start (tylko host)
    const footer  = document.getElementById("room-footer-host")!;
    const startBtn = document.getElementById("btn-start-race") as HTMLButtonElement;
    const hint    = document.getElementById("start-race-hint")!;

    if (isHost) {
      footer.style.display = "block";
      const canStart = state.players.size >= 2 && state.phase === "waiting";
      startBtn.disabled    = !canStart;
      hint.textContent     = canStart ? "" : "Need 2+ players";
    } else {
      footer.style.display = "none";
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  showScreen(name: "landing" | "lobby" | "room"): void {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById(`screen-${name}`)!.classList.add("active");
  }

  hideAllScreens(): void {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  }

  showRoomScreen(): void {
    this.showScreen("room");
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
```

---

## `client/src/ui/lobby.css`

Minimalne style — pixel art feel, ciemne tło, kontrastowy tekst:

```css
.title { font-size: 2.5rem; font-weight: 700; letter-spacing: 2px; margin-bottom: 2rem; }

.form-group { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 1rem; }
.form-group label { font-size: 0.85rem; color: #aaa; }
.form-group input { padding: 0.5rem 0.8rem; border: 2px solid #444; background: #111;
  color: #eee; font-size: 1rem; border-radius: 4px; outline: none; }
.form-group input:focus { border-color: #3498DB; }

.error { color: #E74C3C; font-size: 0.8rem; }

.btn { padding: 0.6rem 1.4rem; border: none; border-radius: 4px; font-size: 1rem;
  cursor: pointer; font-weight: 600; transition: opacity 0.15s; }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-primary  { background: #3498DB; color: #fff; }
.btn-secondary{ background: #2ECC71; color: #fff; }
.btn-danger   { background: #E74C3C; color: #fff; }
.btn-ghost    { background: transparent; color: #aaa; border: 1px solid #444; }
.btn-sm       { padding: 0.3rem 0.8rem; font-size: 0.85rem; }

.lobby-header { display: flex; justify-content: space-between; align-items: center;
  width: 100%; padding: 1rem 2rem; }
.lobby-body { flex: 1; width: 100%; padding: 0 2rem; }
.rooms-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem; }

table { width: 100%; border-collapse: collapse; }
th, td { padding: 0.5rem 0.8rem; text-align: left; border-bottom: 1px solid #333; }
th { color: #888; font-size: 0.8rem; text-transform: uppercase; }

.badge { padding: 0.2rem 0.6rem; border-radius: 3px; font-size: 0.75rem; font-weight: 700; }
.badge-waiting { background: #2ECC71; color: #000; }
.badge-racing  { background: #E74C3C; color: #fff; }

.modal { position: absolute; inset: 0; background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center; pointer-events: all; }
.modal-box { background: #1a1a2e; border: 2px solid #444; border-radius: 8px;
  padding: 2rem; min-width: 300px; }
.modal-actions { display: flex; gap: 1rem; margin-top: 1.5rem; }
.radio-group { display: flex; gap: 1rem; flex-wrap: wrap; }
.radio-group label { display: flex; align-items: center; gap: 0.4rem; cursor: pointer; }

.room-header { display: flex; justify-content: space-between; align-items: flex-start;
  width: 100%; padding: 1.5rem 2rem 1rem; }
.room-body { flex: 1; width: 100%; padding: 0 2rem; }
.room-footer { width: 100%; padding: 1rem 2rem; text-align: center; }

.player-row { display: flex; align-items: center; gap: 0.8rem; padding: 0.6rem 0;
  border-bottom: 1px solid #2a2a3e; }
.color-dot { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; }
.color-dot.empty { background: #333; border: 1px dashed #555; }
.player-name { flex: 1; }
.player-name.waiting { color: #555; font-style: italic; }
.player-score { color: #F39C12; font-weight: 700; min-width: 40px; text-align: right; }
.hint { color: #888; font-size: 0.8rem; margin-top: 0.4rem; }
.leaderboard-note { color: #555; font-size: 0.8rem; margin-top: 1rem; }
.rooms-empty { color: #555; text-align: center; padding: 2rem; }
```

---

## Integracja z resztą aplikacji

W `client/src/main.ts` (spec-08):

```typescript
import { LobbyUI } from "./ui/LobbyUI";

const lobbyUI = new LobbyUI();
lobbyUI.init();

// Po zakończeniu wyścigu GameScene wywołuje:
// lobbyUI.showRoomScreen()
```

---

## Uwagi

- `ColyseusClient.onRaceStart(cb)` — callback wywoływany gdy serwer wysyła `map_layout` z `phase=racing`. LobbyUI chowa ekrany, Phaser zaczyna grę.
- Po zakończeniu wyścigu (`race_result`) GameScene (spec-08) odpowiada za pokazanie ResultsScene, a po 8s woła `lobbyUI.showRoomScreen()`.
- Lobby **nie ma** własnego routera — wyłącznie `classList.add/remove("active")` i `hidden`.
