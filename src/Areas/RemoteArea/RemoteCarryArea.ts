import { GetRoomObjects } from "Helpers/GetRoomObjects";
import type RemoteArea from "./RemoteArea";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import { CreepBase } from "CreepBase";
import { Helper } from "Helpers/Helper";

export function handleCarrier(area: RemoteArea, creep: CreepBase): void {
  if (!creep.isFree()) return;

  if (creep.pos.roomName === area.baseRoom.name) {
    if (creep.isEmpty()) {
      creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, area.roomName)));
    } else {
      const depositLocation = findClosestDeposit(area, creep);
      if (depositLocation) {
        creep.addTask(new CreepTask(Activity.Deposit, depositLocation.pos));
      }
    }
  } else if (creep.pos.roomName === area.roomName) {
    if (creep.isFull()) {
      creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, area.baseRoom.name)));
    } else {
      const sourceResource = findResourceWithEnergy(area, creep, 150);
      if (sourceResource) {
        creep.addTask(new CreepTask(Activity.Pickup, sourceResource.pos));
        return;
      }

      const sourceContainer = findContainerWithEnergy(area, creep, 150);
      if (sourceContainer) {
        creep.addTask(new CreepTask(Activity.Collect, sourceContainer.pos));
        return;
      }

      const littleEnergyResource = findResourceWithEnergy(area, creep, 20);
      if (littleEnergyResource) {
        creep.addTask(new CreepTask(Activity.Pickup, littleEnergyResource.pos));
        return;
      }
    }
  }
}

export function createCarrier(area: RemoteArea): SpawnTask {
  const bodyPartConstants: BodyPartConstant[] = [];
  let maxSegments = area.containers.length >= 2 ? 20 : 15;
  const totalEnergyInContainers = area.containers.reduce(
    (sum, container) => sum + container.store.getUsedCapacity(RESOURCE_ENERGY),
    0
  );
  maxSegments = totalEnergyInContainers < 1000 ? maxSegments / 2 : maxSegments;
  const segments = Math.min(maxSegments, Math.floor(area.baseRoom.energyCapacityAvailable / 100));
  const moveParts = area.roadWorkDone ? segments / 2 : segments;

  for (let i = 0; i < segments; i++) bodyPartConstants.push(CARRY);
  for (let i = 0; i < moveParts; i++) bodyPartConstants.push(MOVE);
  return new SpawnTask(CreepType.Carrier, area.areaId, bodyPartConstants, area, "RemoteCarrier-" + area.roomName);
}

export function findContainerWithEnergy(
  area: RemoteArea,
  creep: CreepBase,
  energyThreshold: number
): StructureContainer | null {
  let bestContainer: StructureContainer | null = null;
  let bestDistance = Infinity;

  for (const container of area.containers) {
    if (container.store.energy > energyThreshold) {
      const distance = creep.pos.getRangeTo(container.pos);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestContainer = container;
      }
    }
  }

  return bestContainer;
}

export function findResourceWithEnergy(area: RemoteArea, creep: CreepBase, energyThreshold: number): Resource | null {
  let bestResource: Resource | null = null;
  let bestDistance = Infinity;

  for (const resource of area.resources) {
    if (resource.amount > energyThreshold) {
      const distance = creep.pos.getRangeTo(resource.pos);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestResource = resource;
      }
    }
  }

  return bestResource;
}

export function findNearbyRemoteEnergy(area: RemoteArea, creep: CreepBase): StructureContainer | Resource | null {
  const resource = findResourceWithEnergy(area, creep, 150);
  if (resource) {
    return resource;
  }

  const container = findContainerWithEnergy(area, creep, 150);
  if (container) {
    return container;
  }

  return null;
}

export function findClosestDeposit(area: RemoteArea, creep: CreepBase): Structure | Creep | null {
  if (!area.baseRoom) return null;

  let bestStructure: Structure | Creep | null = null;
  let bestDistance = Infinity;

  const links = area.baseRoom.find(FIND_STRUCTURES, {
    filter: structure =>
      structure.structureType === STRUCTURE_LINK && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
  });

  for (const link of links) {
    const distance = creep.pos.getRangeTo(link.pos);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestStructure = link;
    }
  }

  const storage = GetRoomObjects.getRoomStorage(area.baseRoom);
  if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    const distance = creep.pos.getRangeTo(storage.pos);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestStructure = storage;
    }
  }

  const containers = area.baseRoom.find(FIND_STRUCTURES, {
    filter: structure =>
      structure.structureType === STRUCTURE_CONTAINER && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
  });

  for (const container of containers) {
    const distance = creep.pos.getRangeTo(container.pos);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestStructure = container;
    }
  }

  // Deposit to creeps in UpgradeArea if we don't have a container next to the controller.
  if (!bestStructure) {
    const upgradeCreepNames = Helper.getCreepNamesFromArea("UpgradeArea", area.baseRoom.controller?.id || "");
    for (let i = 0; i < upgradeCreepNames.length; i++) {
      const upgradeCreep = Game.creeps[upgradeCreepNames[i]];
      if (upgradeCreep && upgradeCreep.store.getUsedCapacity(RESOURCE_ENERGY) < 20) {
        bestStructure = upgradeCreep;
        break;
      }
    }
  }

  return bestStructure;
}
