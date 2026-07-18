import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";
import { CreepBase } from "CreepBase";

export default class ConstructionArea extends BaseArea {
  controller: StructureController;
  maxWorkerCount: number;
  controllerLevel: number;
  containersToCollectFrom: (StructureContainer | Ruin)[];
  droppedResourcesToCollectFrom: Resource[];
  storage: StructureStorage | null;

  constructor(controller: StructureController) {
    super("ConstructionArea", controller.room.name, controller.pos, controller.room);
    this.controller = controller;
    this.controllerLevel = controller.level;
    this.containersToCollectFrom = this.getGeneralStoreToCollectFrom();
    this.maxWorkerCount = this.calculateMaxWorkerCount();
    this.droppedResourcesToCollectFrom = this.getDroppedResourcesToCollectFrom(RESOURCE_ENERGY);
    this.storage = GetRoomObjects.getRoomStorage(controller.room);
  }

  public handleThisArea() {
    this.handleCreeps();
  }

  public handleSpawnTasks(): SpawnTask[] {
    const tasksForThisArea: SpawnTask[] = [];
    if (this.creeps.length < this.maxWorkerCount) {
      const task: SpawnTask | null = this.createCreepForThisArea();
      if (task) {
        tasksForThisArea.push(task);
      }
    }
    return tasksForThisArea;
  }

  public handleCreeps() {
    for (const creep of this.creeps) {
      const threasholdToCollectFrom = Math.min(100, creep.carryCapacity / 2);
      this.interupCurrentTaskIfNeeded(creep);
      if (!creep.isFree()) continue;
      if (creep.isEmpty()) {
        const closestContainer = creep.pos.findClosestByPath(
          this.containersToCollectFrom.filter(c => c.store.energy > threasholdToCollectFrom)
        );
        if (closestContainer) {
          creep.addTask(new CreepTask(Activity.Collect, closestContainer.pos));
          continue;
        }
        const closestDroppedResource = creep.pos.findClosestByPath(
          this.droppedResourcesToCollectFrom.filter(r => r.amount > threasholdToCollectFrom)
        );
        if (closestDroppedResource) {
          creep.addTask(new CreepTask(Activity.Pickup, closestDroppedResource.pos));
          continue;
        }
        if (this.storage && this.storage.store.energy > threasholdToCollectFrom) {
          creep.addTask(new CreepTask(Activity.Collect, this.storage.pos)); // TODO:Add Energy type in here.
          continue;
        }
        // If there is no energy to collect from anywhere, then we should send the creep to harvest from a source. Only if there is no spawn, otherwise spawn should create a harvester
        const spawn = GetRoomObjects.getRoomSpawns(this.room);
        if (spawn.length === 0) {
          const sources = this.room.find(FIND_SOURCES);
          if (sources.length > 0) {
            creep.addTask(new CreepTask(Activity.Harvest, sources[0].pos));
            continue;
          }
        }
        const closestSource = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
        if (closestSource && !creep.pos.inRangeTo(closestSource, 3)) {
          creep.addTask(new CreepTask(Activity.Move, GetRoomObjects.getXStepTowardsSpawn(closestSource.pos, 3)));
          continue;
        }
      }
      if (!creep.isEmpty()) {
        const constructionArea = this.getConstructionClosestByPoint(creep.pos);
        if (constructionArea) {
          creep.addTask(new CreepTask(Activity.Construct, constructionArea.pos));
        } else {
          // If there are no construction sites, then we should change this creep's role to repairer.
          creep.transferCreepToArea(this.areaId, "RepairArea-" + this.room.name);
        }
      }
    }
  }

  private interupCurrentTaskIfNeeded(creep: CreepBase) {
    if (!creep.task) return;
    if (creep.task.activity === Activity.Harvest && Game.time % 10 === 0) {
      // We should cancel the harvest as there might be energy somewhere else.
      creep.task = null;
    }
  }

  private getConstructionClosestByPoint(position: RoomPosition) {
    const spawnConstructionSites = position.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {
      filter: (constructionSite: ConstructionSite) => constructionSite.structureType === STRUCTURE_SPAWN
    });
    if (spawnConstructionSites) return spawnConstructionSites;
    const towerConstructionSites = position.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {
      filter: (constructionSite: ConstructionSite) => constructionSite.structureType === STRUCTURE_TOWER
    });
    if (towerConstructionSites) return towerConstructionSites;
    // Then pick non-road construction sites first, then road construction sites.
    const nonRoadConstructionSites = position.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {
      filter: (constructionSite: ConstructionSite) => constructionSite.structureType !== STRUCTURE_ROAD
    });
    if (nonRoadConstructionSites) return nonRoadConstructionSites;
    return position.findClosestByRange(FIND_MY_CONSTRUCTION_SITES);
  }

  private getConstructionsInRoom(room: Room) {
    const controller = GetRoomObjects.getRoomController(room);
    if (controller) {
      // We don't need a constructor for the controller's container, we have the upgraders.
      const controllerContainer = GetRoomObjects.getWithinRangeConstructionSite(controller.pos, 3, STRUCTURE_CONTAINER);
      return room
        .find(FIND_MY_CONSTRUCTION_SITES)
        .filter(constructionSite => !controllerContainer || constructionSite.id !== controllerContainer.id);
    } else {
      return room.find(FIND_MY_CONSTRUCTION_SITES);
    }
  }

  private calculateMaxWorkerCount(): number {
    const constructions = this.getConstructionsInRoom(this.room);
    const sumOfConstructionPoint = constructions.reduce(function (accumulator, item) {
      return accumulator + item.progressTotal - item.progress;
    }, 0);
    const availableEnergy = this.getAvailableConstructionEnergy();
    if (sumOfConstructionPoint === 0) return 0;
    if (Math.floor(sumOfConstructionPoint / 5000) === 1) return availableEnergy > 1000 ? 1 : 0;
    if (Math.floor(sumOfConstructionPoint / 5000) === 2)
      return availableEnergy > 2000 ? 2 : availableEnergy > 1000 ? 1 : 0;
    if (Math.floor(sumOfConstructionPoint / 5000) >= 3)
      return availableEnergy > 5000 ? 3 : availableEnergy > 2000 ? 2 : availableEnergy > 1000 ? 1 : 0;
    return 1;
  }

  private getAvailableConstructionEnergy(): number {
    let availableEnergy = 0;

    const containers: StructureContainer[] = this.room.find(FIND_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_CONTAINER
    });
    for (const structure of containers) {
      availableEnergy += structure.store.getUsedCapacity(RESOURCE_ENERGY);
    }

    const storage = GetRoomObjects.getRoomStorage(this.room);
    if (storage) {
      availableEnergy += storage.store.getUsedCapacity(RESOURCE_ENERGY);
    }

    const droppedResources: Resource[] = this.room.find(FIND_DROPPED_RESOURCES, {
      filter: { resourceType: RESOURCE_ENERGY }
    });
    for (const droppedResource of droppedResources) {
      availableEnergy += droppedResource.amount;
    }

    return availableEnergy;
  }

  private createCreepForThisArea(): SpawnTask {
    const segments = Math.floor(this.room.energyCapacityAvailable / 200); // Work-100; Carry-50; Move-50
    let bodyPartConstants: BodyPartConstant[] = [];
    if (segments < 1) {
      console.log("ConstructionArea: Something wrong with room capacity");
    } else if (segments === 1) {
      // 200 energy
      bodyPartConstants = [WORK, CARRY, MOVE];
    } else if (segments === 2) {
      // 400 energy
      bodyPartConstants = [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
    } else {
      // 600 energy
      bodyPartConstants = [WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
    }
    return new SpawnTask(CreepType.Constructor, this.areaId, bodyPartConstants, this);
  }
}
