import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "../BaseArea";

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

  public handleThisArea() {
    for (let i = 0; i < this.creeps.length; i++) {
      if (this.creeps[i].isEmpty() && this.creeps[i].isFree()) {
        let foundSomewhereToCollectFrom = false;
        for (let j = 0; j < this.containersToCollectFrom.length; j++) {
          if (this.containersToCollectFrom[j].store.energy < 200) continue;
          this.creeps[i].addTask(new CreepTask(Activity.Collect, this.containersToCollectFrom[j].pos));
          foundSomewhereToCollectFrom = true;
          continue; // This is so that not all creeps get sent to same container.
        }
        const closestDroppedResource = this.creeps[i].pos.findClosestByPath(this.droppedResourcesToCollectFrom);
        if (closestDroppedResource && closestDroppedResource.amount > 200) {
          this.creeps[i].addTask(new CreepTask(Activity.Pickup, closestDroppedResource.pos));
          foundSomewhereToCollectFrom = true;
        }
        if (!foundSomewhereToCollectFrom && this.storage && this.storage.store.energy > 200) {
          this.creeps[i].addTask(new CreepTask(Activity.Collect, this.storage.pos)); // TODO:Add Energy type in here.
        }
        // If there is no energy to collect from anywhere, then we should send the creep to harvest from a source. Only if there is no spawn, otherwise spawn should create a harvester
        const spawn = GetRoomObjects.getRoomSpawns(this.room);
        if (!foundSomewhereToCollectFrom && spawn.length > 0) {
          const sources = this.room.find(FIND_SOURCES);
          if (sources.length > 0) {
            this.creeps[i].addTask(new CreepTask(Activity.Harvest, sources[0].pos));
          }
        }
        if (!foundSomewhereToCollectFrom) {
          const closestSource = this.creeps[i].pos.findClosestByPath(FIND_SOURCES_ACTIVE);
          if (closestSource) {
            this.creeps[i].addTask(
              new CreepTask(Activity.Move, GetRoomObjects.getXStepTowardsSpawn(closestSource.pos, 3))
            );
          }
        }
      }
      if (!this.creeps[i].isEmpty() && this.creeps[i].isFree()) {
        const constructionArea = this.getConstructionClosestByPoint(this.creeps[i].pos);
        if (constructionArea) {
          this.creeps[i].addTask(new CreepTask(Activity.Construct, constructionArea.pos));
        } else {
          // If there are no construction sites, then we should change this creep's role to repairer.
          this.creeps[i].transferCreepToArea(this.areaId, "RepairArea-" + this.room.name);
        }
      }
    }
  }

  private getConstructionClosestByPoint(position: RoomPosition) {
    // Pick non-road construction sites first, then road construction sites. This is because we want to prioritize non-road construction sites first.
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

    const generalStores = this.getGeneralStoreToCollectFrom();
    for (const structure of generalStores) {
      availableEnergy += structure.store.getUsedCapacity(RESOURCE_ENERGY);
    }

    const storage = GetRoomObjects.getRoomStorage(this.room);
    if (storage) {
      availableEnergy += storage.store.getUsedCapacity(RESOURCE_ENERGY);
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
