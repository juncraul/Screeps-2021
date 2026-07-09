import { GetRoomObjects } from "Helpers/GetRoomObjects";
import type RemoteArea from "./RemoteArea";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import { CreepBase } from "CreepBase";

export function handleRepairer(area: RemoteArea, creep: CreepBase): void {
  if (!creep.isFree()) return;

  if (creep.isEmpty()) {
    const energySource = area.findNearbyRemoteEnergy(creep);
    if (energySource) {
      if (energySource instanceof Resource) {
        creep.addTask(new CreepTask(Activity.Pickup, energySource.pos));
      } else {
        creep.addTask(new CreepTask(Activity.Collect, energySource.pos));
      }
      return;
    }

    const fallbackSource = creep.pos.findClosestByRange(area.sources);
    if (fallbackSource) {
      creep.addTask(new CreepTask(Activity.Harvest, fallbackSource.pos));
    }
    return;
  }

  const criticalStructure = GetRoomObjects.getClosestStructureToRepairByPath(creep.pos, 0.4);
  if (criticalStructure) {
    creep.addTask(new CreepTask(Activity.Repair, criticalStructure.pos));
    return;
  }

  const constructionSite = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES);
  if (constructionSite) {
    creep.addTask(new CreepTask(Activity.Construct, constructionSite.pos));
    return;
  }

  const nonCriticalStructure = GetRoomObjects.getClosestStructureToRepairByPath(creep.pos, 0.7);
  if (nonCriticalStructure) {
    creep.addTask(new CreepTask(Activity.Repair, nonCriticalStructure.pos));
    return;
  }

  const anyDamagedStructure = GetRoomObjects.getClosestStructureToRepairByPath(creep.pos, 0.9);
  if (anyDamagedStructure) {
    creep.addTask(new CreepTask(Activity.Repair, anyDamagedStructure.pos));
    return;
  }

  const anyWallsOrRamparts = GetRoomObjects.getClosestWallRampartToRepairByPath(creep.pos);
  if (anyWallsOrRamparts) {
    creep.addTask(new CreepTask(Activity.Repair, anyWallsOrRamparts.pos));
    return;
  }

  const anyDamageBearlyScrached = GetRoomObjects.getClosestStructureToRepairByPath(creep.pos, 1.0);
  if (anyDamageBearlyScrached) {
    creep.addTask(new CreepTask(Activity.Repair, anyDamageBearlyScrached.pos));
    return;
  }
}

export function shouldSpawnRepairer(area: RemoteArea): boolean {
  if (!area.room) {
    return false;
  }

  if (area.room.find(FIND_MY_CONSTRUCTION_SITES).length > 0) {
    return true;
  }

  return (
    area.room.find(FIND_STRUCTURES, {
      filter: structure =>
        structure.structureType !== STRUCTURE_WALL &&
        structure.structureType !== STRUCTURE_RAMPART &&
        structure.hits < structure.hitsMax * 0.5
    }).length > 0
  );
}

export function createRepairer(area: RemoteArea): SpawnTask {
  const bodyPartConstants: BodyPartConstant[] = [];
  const segments = Math.min(4, Math.floor(area.baseRoom.energyCapacityAvailable / 200));

  for (let i = 0; i < segments; i++) bodyPartConstants.push(WORK);
  for (let i = 0; i < segments; i++) bodyPartConstants.push(CARRY);
  for (let i = 0; i < segments; i++) bodyPartConstants.push(MOVE);
  return new SpawnTask(CreepType.Repairer, area.areaId, bodyPartConstants, area, "RemoteRepairer-" + area.roomName);
}
