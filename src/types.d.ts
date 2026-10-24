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
  baseRoomCollectIntentCategory?: string;
  baseRoomSpendIntentCategory?: string;
  lastTickEnergy: number;
}

interface RemoteRoomEconomy {
  energyCollected: number;
  energySpent: number;
}

interface ScoutControllerIntel {
  x: number;
  y: number;
  roomName: string;
  level: number | null;
  owner: string | null;
  reservation: string | null;
}

interface ScoutRoomIntel {
  roomName: string;
  lastSeen: number;
  lastEnemySeen?: number;
  controller: ScoutControllerIntel | null;
  sources: {
    id: string;
    x: number;
    y: number;
  }[];
  minerals: {
    id: string;
    x: number;
    y: number;
    mineralType: ResourceConstant;
    amount: number;
  }[];
  hostileCount: number;
  claimable: boolean;
}

interface BaseRoomEnergyStats {
  energyCollected: number;
  energySpent: number;
  collectedByCategory: Record<string, number>;
  spentByCategory: Record<string, number>;
  snapshots: BaseRoomEnergySnapshot[];
  lastUpdatedTick: number;
  spawnPlacedTick?: number;
  controllerLevelTicks: Record<number, number>;
}

interface BaseRoomEnergySnapshot {
  tick: number;
  energyCollected: number;
  energySpent: number;
}

interface RoomObjectControllerInfoMemory {
  id: string;
  x: number;
  y: number;
  containerId: string | null;
  linkId: string | null;
  containerPos?: RoomObjectPositionMemory | null;
  linkPos?: RoomObjectPositionMemory | null;
}

interface RoomObjectSourceInfoMemory {
  id: string;
  x: number;
  y: number;
  containerId: string | null;
  linkId: string | null;
  extensionIds: string[];
  containerPos?: RoomObjectPositionMemory | null;
  linkPos?: RoomObjectPositionMemory | null;
}

interface RoomObjectMineralInfoMemory {
  id: string;
  x: number;
  y: number;
  containerId: string | null;
  containerPos?: RoomObjectPositionMemory | null;
}

interface RoomObjectPositionMemory {
  x: number;
  y: number;
}

interface RoomObjectExitInfoMemory {
  x: number;
  y: number;
}

interface RoomObjectBestExitInfoMemory {
  x: number;
  y: number;
  calculatedTick: number;
}

interface RoomObjectsMemory {
  lastTimeTopologyWasChecked: number;
  lastUpdatedTick: number;
  roomName: string;
  controller: RoomObjectControllerInfoMemory | null;
  sources: RoomObjectSourceInfoMemory[];
  minerals: RoomObjectMineralInfoMemory[];
  exits: RoomObjectExitInfoMemory[];
  bestExitPositions?: Partial<Record<ExitConstant, RoomObjectBestExitInfoMemory>>;
  labArea?: {
    reactionPlan?: LabAreaReactionPlanMemory;
    nextReactionPlanSearchTick?: number;
  };
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

interface SoldierKiteState {
  tick: number;
  totalHits: number;
  isRetreating: boolean;
}

interface SoldierCompositionMemory {
  squadSize: number;
  baseRoomName?: string;
  powerRank: number | null;
  primaryColor: number;
  secondaryColor: number;
  targetRoom: string;
  creepNames: string[];
  roleCounts: Record<string, number>;
  dyingCount: number;
}

interface SoldierNavigationMemory {
  lastStyle?: "edge" | "quad" | "duo" | "line";
  edgeMode?: boolean;
  edgeKiteState?: SoldierKiteState;
  quadKiteState?: SoldierKiteState;
  duoKiteState?: SoldierKiteState;
  quadSlots?: string[];
}

interface SoldierAreaMemory {
  flagState?: SoldierFlagState;
  composition?: SoldierCompositionMemory;
  navigation?: SoldierNavigationMemory;
  chases?: Record<string, SoldierChaseMemory>;
  ignoredChaseTargets?: Record<string, number>;
  assembly?: SoldierAssemblyMemory;
  lastUpdatedTick?: number;
}

interface SoldierAssemblyMemory {
  roomName: string;
  squadSize: number;
  deployed: boolean;
  slots: RoomObjectPositionMemory[];
  nextSearchTick?: number;
}

interface SoldierChaseMemory {
  targetId: string;
  bestRange: number;
  lastProgressTick: number;
  lastTick: number;
}

interface AreasMemory {
  Soldiers?: Record<string, SoldierAreaMemory>;
}

interface LabAreaReactionPlanMemory {
  product: ResourceConstant;
  reagentA: ResourceConstant;
  reagentB: ResourceConstant;
  inputLabAId: Id<StructureLab>;
  inputLabBId: Id<StructureLab>;
  outputLabIds: Id<StructureLab>[];
}

interface Memory {
  uuid: number;
  log: any;
  Keys: any; // TODO: Find a proper type for this
  profiler?: {
    map?: Record<string, unknown>;
    totalTime?: number;
    enabledTick?: number;
    disableTick?: number | false;
    type?: string;
    filter?: string;
  } | null;
  Rooms?: Record<string, RoomObjectsMemory>;
  roomVisuals: boolean;
  scoreHistory: ScoreCollectionRecord[];
  seasonExploredRooms?: ExploredRoom[];
  seasonEnemyRooms?: string[];
  scoutIntel?: Record<string, ScoutRoomIntel>;
  soldierFlagState?: SoldierFlagState;
  soldierFlagStates?: Record<string, SoldierFlagState>;
  Areas?: AreasMemory;
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

declare module "screeps-profiler" {
  interface ScreepsProfiler {
    enable(): void;
    wrap<T>(callback: () => T): T;
    registerClass<T extends { prototype: unknown }>(targetClass: T, label: string): void;
    registerObject<T extends Record<string, unknown>>(targetObject: T, label: string): T;
    registerFN<T extends (...args: any[]) => any>(targetFunction: T, label?: string): T;
  }

  const profiler: ScreepsProfiler;
  export default profiler;
}
