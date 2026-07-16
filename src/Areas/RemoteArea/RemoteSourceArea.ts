import { Helper } from "Helpers/Helper";
import { GetRoomObjects } from "Helpers/GetRoomObjects";
import type RemoteArea from "./RemoteArea";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import { CreepBase } from "CreepBase";

export function handleHarvester(area: RemoteArea, creep: CreepBase): void {
  if (!creep.isFree()) return;

  let targetSource = area.getSourceForCreep(creep.name);
  if (!targetSource) {
    targetSource = area.findSourceWithFewestHarvesters();
    if (!targetSource) return;
    area.assignHarvesterToSource(creep.name, targetSource.id);
  }

  const container = GetRoomObjects.getWithinRangeContainer(targetSource.pos, 2);
  const constructionSite = GetRoomObjects.getWithinRangeConstructionSite(targetSource.pos, 1, STRUCTURE_CONTAINER);

  if (constructionSite) {
    if (creep.isFull()) {
      creep.addTask(new CreepTask(Activity.Construct, constructionSite.pos));
    } else {
      creep.addTask(new CreepTask(Activity.Harvest, targetSource.pos));
    }
  } else if (container) {
    if (!Helper.isSamePosition(container.pos, creep.pos)) {
      creep.addTask(new CreepTask(Activity.Move, container.pos));
    } else {
      creep.addTask(new CreepTask(Activity.HarvestAndDeposit, targetSource.pos));
    }
  } else {
    creep.addTask(new CreepTask(Activity.Harvest, targetSource.pos));
  }
}

export function createHarvester(area: RemoteArea): SpawnTask {
  const bodyPartConstants: BodyPartConstant[] = [];
  let segments = Math.min(5, Math.floor((area.baseRoom.energyCapacityAvailable - 50) / 150));
  const baseControllerLevel = area.baseRoom.controller ? area.baseRoom.controller.level : 0;
  const carryParts = area.containers.length !== area.sources.length && baseControllerLevel >= 3 ? 1 : 0;
  const moveParts = area.roadWorkDone ? segments / 2 : segments;
  if (area.controller && area.controller.reservation && area.controller.reservation.ticksToEnd < 100) {
    segments = Math.min(3, segments); // If the reservation is about to expire, we don't need a big harvester.
  }

  for (let i = 0; i < segments; i++) bodyPartConstants.push(WORK);
  for (let i = 0; i < carryParts; i++) bodyPartConstants.push(CARRY);
  for (let i = 0; i < moveParts; i++) bodyPartConstants.push(MOVE);

  return new SpawnTask(CreepType.Harvester, area.areaId, bodyPartConstants, area, "RemoteHarvester-" + area.roomName);
}

export function getHarvestersForSource(area: RemoteArea, sourceId: string): CreepBase[] {
  const key = `RemoteArea-Harvester-${sourceId}`;
  const creepNames: string[] = Helper.getCashedMemory(key, []);
  const creeps: CreepBase[] = [];
  for (let i = creepNames.length - 1; i >= 0; i--) {
    const creep = Game.creeps[creepNames[i]];
    if (creep && creep.hits > 0) {
      creeps.push(new CreepBase(creep));
    } else {
      creepNames.splice(i, 1);
    }
  }
  Helper.setCashedMemory(key, creepNames);
  return creeps;
}

export function assignHarvesterToSource(area: RemoteArea, creepName: string, sourceId: string): void {
  const key = `RemoteArea-Harvester-${sourceId}`;
  const creepNames: string[] = Helper.getCashedMemory(key, []);
  if (!creepNames.includes(creepName)) {
    creepNames.push(creepName);
    Helper.setCashedMemory(key, creepNames);
  }
}

export function getSourceForCreep(area: RemoteArea, creepName: string): Source | null {
  for (const source of area.sources) {
    const key = `RemoteArea-Harvester-${source.id}`;
    const creepNames: string[] = Helper.getCashedMemory(key, []);
    if (creepNames.includes(creepName)) {
      return source;
    }
  }
  return null;
}

export function findSourceWithFewestHarvesters(area: RemoteArea): Source | null {
  let minCount = Infinity;
  let targetSource: Source | null = null;
  for (const source of area.sources) {
    const count = getHarvestersForSource(area, source.id).length;
    if (count < minCount) {
      minCount = count;
      targetSource = source;
    }
  }
  return targetSource;
}
