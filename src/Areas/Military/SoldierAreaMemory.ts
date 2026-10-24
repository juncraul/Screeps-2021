import { CreepBase } from "CreepBase";
import { CreepType } from "CreepType";
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

export function selectSoldierChaseTarget(
  flagName: string,
  pursuitKey: string,
  pursuers: CreepBase[],
  candidates: Creep[],
  origin: RoomPosition
): Creep | null {
  const attackers = pursuers.filter(
    creep => creep.creepType !== CreepType.Healer && creep.pos.roomName === origin.roomName
  );
  if (attackers.length === 0) return origin.findClosestByPath(candidates);

  const memory = getSoldierAreaMemory(flagName);
  const chases = memory.chases ?? (memory.chases = {});
  const ignored = memory.ignoredChaseTargets ?? (memory.ignoredChaseTargets = {});
  for (const id of Object.keys(ignored)) {
    if (ignored[id] <= Game.time) delete ignored[id];
  }
  let available = candidates.filter(target => ignored[target.id] === undefined);
  while (available.length > 0) {
    const target = origin.findClosestByPath(available);
    if (!target) break;
    const range = Math.min(...attackers.map(creep => creep.pos.getRangeTo(target.pos)));
    const inAttackRange = attackers.some(
      creep => creep.pos.getRangeTo(target.pos) <= (creep.creepType === CreepType.Ranged ? 3 : 1)
    );
    const previous = chases[pursuitKey];
    if (
      !previous ||
      previous.targetId !== target.id ||
      previous.lastTick < Game.time - 1 ||
      range < previous.bestRange ||
      inAttackRange
    ) {
      chases[pursuitKey] = {
        targetId: target.id,
        bestRange: range,
        lastProgressTick: Game.time,
        lastTick: Game.time
      };
      return target;
    }
    previous.lastTick = Game.time;
    if (
      Game.time - previous.lastProgressTick < 5 ||
      pursuers.some(pursuer => pursuer.creep && pursuer.creep.getActiveBodyparts(RANGED_ATTACK) > 0)
    ) {
      return target;
    }

    ignored[target.id] = Game.time + 25;
    delete chases[pursuitKey];
    available = available.filter(candidate => candidate.id !== target.id);
  }
  delete chases[pursuitKey];
  return null;
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

export function setSoldierNavigationStyle(flagName: string, style: "edge" | "quad" | "duo" | "line" | undefined): void {
  const record = getSoldierAreaMemory(flagName);
  if (!record.navigation) {
    record.navigation = {};
  }
  record.navigation.lastStyle = style;
  record.lastUpdatedTick = Game.time;
}

export function getSoldierNavigationStyle(flagName: string): "edge" | "quad" | "duo" | "line" | undefined {
  return getSoldierAreaMemory(flagName).navigation?.lastStyle;
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

export function getSoldierDuoKiteState(flagName: string): SoldierKiteState | undefined {
  return getSoldierAreaMemory(flagName).navigation?.duoKiteState;
}

export function setSoldierDuoKiteState(flagName: string, state: SoldierKiteState): void {
  const record = getSoldierAreaMemory(flagName);
  if (!record.navigation) {
    record.navigation = {};
  }
  record.navigation.duoKiteState = state;
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
  if (record.chases) {
    for (const key of Object.keys(record.chases)) {
      if (key !== "quad" && key !== "duo" && !creeps.some(creep => creep.name === key)) delete record.chases[key];
    }
  }
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
