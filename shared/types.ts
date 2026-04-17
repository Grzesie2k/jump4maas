export enum Tile {
  Empty      = 0,
  Ground     = 1,
  Platform   = 2,
  Finish     = 3,
  Decoration = 4,
}

export interface InputMessage {
  left:  boolean;
  right: boolean;
  jump:  boolean;
  seq:   number;
}

export interface StartRaceMessage {
  type: "start_race";
}

export interface LeaveRoomMessage {
  type: "leave_room";
}

export interface EnemySpawn {
  x: number;
  y: number;
}

export interface MapLayoutMessage {
  type:        "map_layout";
  seed:        number;
  tiles:       number[];        // flat row-major array, length = WIDTH_TILES * HEIGHT_TILES
  enemySpawns: EnemySpawn[];
  finishX:     number;          // px, leading edge of finish line
  raceNumber:  number;
}

export interface RaceResultEntry {
  playerId:    string;
  name:        string;
  position:    number;          // 1-based; 0 = eliminated / DNF
  pointsEarned: number;
  totalScore:  number;
}

export interface RaceResultMessage {
  type:    "race_result";
  results: RaceResultEntry[];
}

export interface IPlayerState {
  id:          string;
  name:        string;
  color:       string;
  x:           number;
  y:           number;
  vx:          number;
  vy:          number;
  lives:       number;
  totalScore:  number;
  raceScore:   number;
  grounded:    boolean;
  finished:    boolean;
  eliminated:  boolean;
  facingRight: boolean;
}

export interface IEnemyState {
  id:          number;
  x:           number;
  y:           number;
  facingRight: boolean;
}

export interface IGameState {
  phase:      string;           // "waiting" | "countdown" | "racing" | "results"
  players:    Map<string, IPlayerState>;
  enemies:    IEnemyState[];
  countdown:  number;
  maxPlayers: number;
  roomName:   string;
  raceNumber: number;
}
