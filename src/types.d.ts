
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
  Keys: any; //TODO: Find a proper type for this
}

interface ICreepTask {
  activity: number;
  targetPlace: RoomPosition;
  taskDone: boolean;
}

// `global` extension samples
declare namespace NodeJS {
  interface Global {
    log: any;
  }
}