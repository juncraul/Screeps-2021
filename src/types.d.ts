// example declaration file - remove these and add your own custom typings

// memory extension samples
interface CreepMemory {
  role: string;
  room: string;
  working: boolean;
}

interface Memory {
  uuid: number;
  log: any;
  Keys: any; //TODO: Find a proper type for this
}

// `global` extension samples
declare namespace NodeJS {
  interface Global {
    log: any;
  }
}
