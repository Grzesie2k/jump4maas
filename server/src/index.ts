import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import { createServer } from "http";
import { join } from "path";
import { GameRoom } from "./rooms/GameRoom";

const app = express();
app.use(express.static("../../client/dist"));

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("game_room", GameRoom).enableRealtimeListing();

httpServer.listen(2567, '0.0.0.0',() => console.log("Server running on :2567"));
