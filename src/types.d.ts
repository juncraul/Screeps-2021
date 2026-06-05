// memory extension samples
interface CreepMemory {
  role: string;
  room: string;
  working: boolean;
  task: any;
}

interface Memory {
  uuid: number;
  log: any;
  Keys: any; // TODO: Find a proper type for this
  roomVisuals: boolean;
  scoreHistory: ScoreCollectionRecord[];
}

interface ScoreCollectionRecord {
  tick: number;
  x: number;
  y: number;
  roomName: string;
}

// Season 10 Score items – not in @types/screeps, declared here.
declare const FIND_SCORES: 10011;

interface Score {
  id: Id<Score>;
  pos: RoomPosition;
  score: number;
  room: Room;
}

interface Room {
  find(type: 10011): Score[];
}

interface ICreepTask {
  activity: number;
  targetPlace: RoomPosition;
  taskDone: boolean;
}

interface FlagMemory {
  baseBuilder?: {
    autoPlaced?: boolean;
  };
}

// `global` extension samples
declare namespace NodeJS {
  interface Global {
    log: any;
  }
}
