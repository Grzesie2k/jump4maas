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

  // Non-schema state (server only)
  checkpointX:    number = 0;
  lastCheckpoint: number = 0;  // timestamp ms
  lastInput:      { left: boolean; right: boolean; jump: boolean; seq: number } =
    { left: false, right: false, jump: false, seq: 0 };
  prevY:          number = 0;  // previous frame Y position (for one-way platforms)
}

export class EnemyState extends Schema {
  @type("uint8")   id:          number  = 0;
  @type("float32") x:           number  = 0;
  @type("float32") y:           number  = 0;
  @type("boolean") facingRight: boolean = true;

  // Non-schema state (server only)
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
