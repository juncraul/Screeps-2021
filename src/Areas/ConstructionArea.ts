import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";

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
        for (let j = 0; j < this.droppedResourcesToCollectFrom.length && !foundSomewhereToCollectFrom; j++) {
          if (this.droppedResourcesToCollectFrom[j].amount < 200) continue;
          this.creeps[i].addTask(new CreepTask(Activity.Pickup, this.droppedResourcesToCollectFrom[j].pos));
          foundSomewhereToCollectFrom = true;
        }
        if (!foundSomewhereToCollectFrom && this.storage && this.storage.store.energy > 200) {
          this.creeps[i].addTask(new CreepTask(Activity.Collect, this.storage.pos)); // TODO:Add Energy type in here.
        }
      }
      if (!this.creeps[i].isEmpty() && this.creeps[i].isFree()) {
        const constructionArea = this.getConstructionClosestByPoint(this.creeps[i].pos);
        if (constructionArea) {
          this.creeps[i].addTask(new CreepTask(Activity.Construct, constructionArea.pos));
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
    return room.find(FIND_MY_CONSTRUCTION_SITES);
  }

  private calculateMaxWorkerCount(): number {
    if (this.containersToCollectFrom.length === 0) return 0;
    const constructions = this.getConstructionsInRoom(this.room);
    const sumOfConstructionPoint = constructions.reduce(function (accumulator, item) {
      return accumulator + item.progressTotal - item.progress;
    }, 0);
    return Math.floor(sumOfConstructionPoint / 5000 >= 3 ? 3 : Math.ceil(sumOfConstructionPoint / 5000));
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
    return new SpawnTask(SpawnType.Constructor, this.areaId, "Constructor", bodyPartConstants, this);
  }
}
