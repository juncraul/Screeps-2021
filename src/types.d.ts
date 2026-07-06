// memory extension samples
interface CreepMemory {
  role: string;
  room: string;
  working: boolean;
  task: any;
  seasonSpawnRoom?: string;
  remoteRoomName?: string;
  soldierFlag?: string | null;
  formationOrder?: number | null;
  currentMineralType?: string | null;
  willSuicideAtTick?: number | undefined;
  sourceKeeperRecovering?: boolean;
  lastCollectedFromExtensionOrSpawnId?: string | null;
  baseRoomCollectIntentCategory?: string;
  baseRoomSpendIntentCategory?: string;
  lastTickEnergy: number;
}

interface RemoteRoomEconomy {
  energyCollected: number;
  energySpent: number;
}

interface BaseRoomEnergyStats {
  energyCollected: number;
  energySpent: number;
  collectedByCategory: Record<string, number>;
  spentByCategory: Record<string, number>;
  snapshots: BaseRoomEnergySnapshot[];
  lastUpdatedTick: number;
}

interface BaseRoomEnergySnapshot {
  tick: number;
  energyCollected: number;
  energySpent: number;
}

interface RoomDefenseState {
  wallAndRampartCount: number;
  coreStructureDamaged: number;
  breachDetected: boolean;
  lastAttackTick: number;
}

interface SoldierFlagState {
  x: number;
  y: number;
  roomName: string;
  color: number;
  secondaryColor: number;
}

interface Memory {
  uuid: number;
  log: any;
  Keys: any; // TODO: Find a proper type for this
  roomVisuals: boolean;
  scoreHistory: ScoreCollectionRecord[];
  seasonExploredRooms?: ExploredRoom[];
  seasonEnemyRooms?: string[];
  soldierFlagState?: SoldierFlagState;
  soldierFlagStates?: Record<string, SoldierFlagState>;
  remoteRoomEconomy?: Record<string, RemoteRoomEconomy>;
  baseRoomStats?: Record<string, BaseRoomEnergyStats>;
  roomDefenseStates?: Record<string, RoomDefenseState>;
}

interface ScoreCollectionRecord {
  tick: number;
  x: number;
  y: number;
  roomName: string;
}

// Extend Memory interface to include season properties
interface ExploredRoom {
  roomName: string;
  exploredAt: number;
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

// CPU extension for generatePixel method (Screeps World CPU)
interface CPU {
  generatePixel(): string;
}
