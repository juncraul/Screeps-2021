import { CreepBase } from "CreepBase";
import type { AttackFlagConfig } from "./SoldierArea";

function ensureAreasMemory(): AreasMemory {
  if (!Memory.Areas || typeof Memory.Areas !== "object") {
    Memory.Areas = {};
  }
  return Memory.Areas;
}

function ensureSoldiersMemory(): Record<string, SoldierAreaMemory> {
  const areas = ensureAreasMemory();
  if (!areas.Soldiers || typeof areas.Soldiers !== "object") {
    areas.Soldiers = {};
  }
  return areas.Soldiers;
}

export function getSoldierAreaMemory(flagName: string): SoldierAreaMemory {
  const soldiers = ensureSoldiersMemory();
  if (!soldiers[flagName]) {
    soldiers[flagName] = {};
  }
  return soldiers[flagName];
}

export function setSoldierFlagState(flagName: string, state: SoldierFlagState): void {
  const record = getSoldierAreaMemory(flagName);
  record.flagState = state;
  record.lastUpdatedTick = Game.time;
}

export function getSoldierCreepNames(flagName: string): string[] {
  return getSoldierAreaMemory(flagName).composition?.creepNames ?? [];
}

export function setSoldierCreepNames(flagName: string, creepNames: string[]): void {
  const record = getSoldierAreaMemory(flagName);
  const composition = record.composition ?? {
    squadSize: 0,
    powerRank: null,
    primaryColor: COLOR_RED,
    secondaryColor: COLOR_RED,
    targetRoom: "",
    creepNames: [],
    roleCounts: {},
    dyingCount: 0
  };

  composition.creepNames = creepNames;
  record.composition = composition;
  record.lastUpdatedTick = Game.time;
}

export function addSoldierCreepName(flagName: string, creepName: string): void {
  const creepNames = getSoldierCreepNames(flagName);
  if (creepNames.includes(creepName)) {
    return;
  }

  creepNames.push(creepName);
  setSoldierCreepNames(flagName, creepNames);
}

export function getAllSoldierFlagStates(): Record<string, SoldierFlagState> {
  const soldiers = ensureSoldiersMemory();
  const states: Record<string, SoldierFlagState> = {};
  for (const [flagName, record] of Object.entries(soldiers)) {
    if (record.flagState) {
      states[flagName] = record.flagState;
    }
  }
  return states;
}

export function clearSoldierAreaMemory(flagName: string): void {
  const soldiers = ensureSoldiersMemory();
  delete soldiers[flagName];
}

export function setSoldierNavigationStyle(flagName: string, style: "edge" | "quad" | "line"): void {
  const record = getSoldierAreaMemory(flagName);
  if (!record.navigation) {
    record.navigation = {};
  }
  record.navigation.lastStyle = style;
  record.lastUpdatedTick = Game.time;
}

export function getSoldierEdgeKiteState(flagName: string): SoldierKiteState | undefined {
  return getSoldierAreaMemory(flagName).navigation?.edgeKiteState;
}

export function setSoldierEdgeKiteState(flagName: string, state: SoldierKiteState): void {
  const record = getSoldierAreaMemory(flagName);
  if (!record.navigation) {
    record.navigation = {};
  }
  record.navigation.edgeKiteState = state;
  record.lastUpdatedTick = Game.time;
}

export function getSoldierEdgeMode(flagName: string): boolean {
  return getSoldierAreaMemory(flagName).navigation?.edgeMode ?? false;
}

export function setSoldierEdgeMode(flagName: string, isEdgeMode: boolean): void {
  const record = getSoldierAreaMemory(flagName);
  if (!record.navigation) {
    record.navigation = {};
  }
  record.navigation.edgeMode = isEdgeMode;
  record.lastUpdatedTick = Game.time;
}

export function getSoldierQuadKiteState(flagName: string): SoldierKiteState | undefined {
  return getSoldierAreaMemory(flagName).navigation?.quadKiteState;
}

export function setSoldierQuadKiteState(flagName: string, state: SoldierKiteState): void {
  const record = getSoldierAreaMemory(flagName);
  if (!record.navigation) {
    record.navigation = {};
  }
  record.navigation.quadKiteState = state;
  record.lastUpdatedTick = Game.time;
}

export function getSoldierQuadSlots(flagName: string): string[] {
  return getSoldierAreaMemory(flagName).navigation?.quadSlots ?? [];
}

export function setSoldierQuadSlots(flagName: string, slots: string[]): void {
  const record = getSoldierAreaMemory(flagName);
  if (!record.navigation) {
    record.navigation = {};
  }
  record.navigation.quadSlots = slots;
  record.lastUpdatedTick = Game.time;
}

export function updateSoldierComposition(flag: AttackFlagConfig, creeps: CreepBase[]): void {
  const roleCounts: Record<string, number> = {};
  for (const creep of creeps) {
    const role = creep.memory.role ?? creep.creepType.toString();
    roleCounts[role] = (roleCounts[role] ?? 0) + 1;
  }

  const dyingCount = creeps.filter(c => c.ticksToLive && c.ticksToLive < 250).length;
  const record = getSoldierAreaMemory(flag.name);
  record.composition = {
    squadSize: flag.squadSize,
    baseRoomName: flag.baseRoomName,
    powerRank: flag.powerRank,
    primaryColor: flag.primaryColor,
    secondaryColor: flag.secondaryColor,
    targetRoom: flag.targetRoom,
    creepNames: creeps.map(c => c.name),
    roleCounts,
    dyingCount
  };
  record.lastUpdatedTick = Game.time;
}
