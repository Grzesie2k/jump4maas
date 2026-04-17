import { ColyseusClient } from "../network/ColyseusClient";
import type { IGameState } from "@shared/types";

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
        <td><span class="badge ${canJoin ? "badge-waiting" : "badge-racing"}">${canJoin ? "Waiting" : "Racing"}</span></td>
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
    ColyseusClient.onRaceStart((layout) => {
      this.hideAllScreens();
      (window as any).__phaserGame?.scene.start("GameScene", { layout });
    });
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

  private updateRoomScreen(state: IGameState): void {
    const isHost = ColyseusClient.isHost();

    (document.getElementById("room-title")!).textContent        = state.roomName;
    (document.getElementById("room-player-count")!).textContent =
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
    const footer   = document.getElementById("room-footer-host")!;
    const startBtn = document.getElementById("btn-start-race") as HTMLButtonElement;
    const hint     = document.getElementById("start-race-hint")!;

    if (isHost) {
      footer.style.display = "block";
      const canStart       = state.players.size >= 1 && state.phase === "waiting";
      startBtn.disabled    = !canStart;
      hint.textContent     = "";
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
