import { GetRoomObjects } from "Helpers/GetRoomObjects";
import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";
import { CreepBase } from "CreepBase";

export default class UpgradeArea extends BaseArea {
  controller: StructureController;
  maxWorkerCount: number;
  controllerLevel: number;
  containerNextToController: StructureContainer | null;
  linkNextToController: StructureLink | null;
  containerConstructionSiteNextToController: ConstructionSite | null;
  linkConstructionSiteNextToController: ConstructionSite | null;

  constructor(controller: StructureController) {
    super("UpgradeArea", controller.id, controller.pos, controller.room);
    this.controller = controller;
    this.controllerLevel = controller.level;
    this.containerNextToController = GetRoomObjects.getWithinRangeContainer(controller.pos, 2);
    this.linkNextToController = GetRoomObjects.getWithinRangeLink(controller.pos, 2);
    this.containerConstructionSiteNextToController = GetRoomObjects.getWithinRangeConstructionSite(
      controller.pos,
      2,
      STRUCTURE_CONTAINER
    );
    this.maxWorkerCount = this.calculateMaxWorkerCount();
    this.linkConstructionSiteNextToController = GetRoomObjects.getWithinRangeConstructionSite(
      controller.pos,
      2,
      STRUCTURE_LINK
    );
  }

  public handleSpawnTasks(): SpawnTask[] {
    const tasksForThisArea: SpawnTask[] = [];
    if (this.creeps.length < this.maxWorkerCount) {
      // Diabled this logic, not sure why we don't create an upgrader if there is no container next to the controller, we should still create one and let it upgrade the controller until we have a container built.
      // if (!this.containerNextToController) {
      //   return tasksForThisArea; // There is no container next to the controller.
      // }
      const task: SpawnTask | null = this.createCreepForThisArea();
      if (task) {
        tasksForThisArea.push(task);
      }
    }
    return tasksForThisArea;
  }

  public handleThisArea() {
    this.handleSetup();
    this.handleCreeps();
  }

  private handleSetup() {
    if (!this.containerNextToController && !this.containerConstructionSiteNextToController) {
      const positionForContainer = Helper.getFreeAdjacentPositions(this.controller.pos, this.room, 2, 2)[0];
      if (positionForContainer) {
        this.room.createConstructionSite(positionForContainer, STRUCTURE_CONTAINER);
      } else {
        console.log("UpgradeArea: No position for container next to controller");
      }
    }

    if (this.controllerLevel < 6) return;

    if (!this.linkNextToController && !this.linkConstructionSiteNextToController && this.containerNextToController) {
      const positionForLink = Helper.getFreeAdjacentPositions(this.containerNextToController.pos, this.room, 2, 2)[0];
      if (positionForLink) {
        this.room.createConstructionSite(positionForLink, STRUCTURE_LINK);
      } else {
        console.log("UpgradeArea: No position for link next to controller");
      }
    }
  }

  private handleCreeps() {
    for (let i: number = this.creeps.length - 1; i >= 0; i--) {
      if (!this.creeps[i].isFree()) {
        continue;
      }

      // Find some resources
      if (!this.creeps[i].isFull()) {
        this.findSomwhereToCollectEnergyFrom(this.creeps[i]);
      }

      // Build the construction site(Container) or do the main job, which is upgrade the controller.
      if (this.creeps[i].isFull()) {
        if (this.containerConstructionSiteNextToController && this.controller.ticksToDowngrade > 8000) {
          this.creeps[i].addTask(new CreepTask(Activity.Construct, this.containerConstructionSiteNextToController.pos));
        } else {
          this.creeps[i].addTask(new CreepTask(Activity.Upgrade, this.controller.pos));
        }
      }
    }
  }

  private calculateMaxWorkerCount(): number {
    // For level 8 there is no point having more than one upgrader.
    if (this.controllerLevel === 8) {
      return 1;
    }

    const availableUpgradeEnergy = this.getAvailableUpgradeEnergy();

    if (availableUpgradeEnergy > 50000) {
      return 5;
    } else if (availableUpgradeEnergy >= 20000) {
      return 4;
    } else if (availableUpgradeEnergy >= 10000) {
      return 3;
    } else if (availableUpgradeEnergy >= 3000) {
      return 2;
    }

    return 1;
  }

  private getAvailableUpgradeEnergy(): number {
    let availableEnergy = 0;

    if (this.containerNextToController) {
      availableEnergy += this.containerNextToController.store[RESOURCE_ENERGY];
    }

    if (this.linkNextToController) {
      availableEnergy += this.linkNextToController.store[RESOURCE_ENERGY];
    }

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
    const bodyPartConstants: BodyPartConstant[] = [];
    let segments = Math.floor(this.room.energyCapacityAvailable / 200); // WORK-100; CARRY-50; MOVE-50
    if (this.creeps.length === 0) {
      // Use energyAvailable for the first creep to ensure it can spawn sooner
      segments = Math.floor(this.room.energyAvailable / 200);
    }
    if (segments < 1) {
      segments = 1;
    }
    // Cap segments at reasonable limits based on controller level
    if (this.controllerLevel <= 4 && segments > 5) {
      segments = 5;
    } else if (this.controllerLevel <= 6 && segments > 10) {
      segments = 10;
    } else if (segments > 20) {
      segments = 20;
    }

    const carryParts =
      this.containerNextToController && this.containerNextToController.store.getFreeCapacity(RESOURCE_ENERGY) > 100
        ? 1
        : segments;

    const moveParts = this.controllerLevel <= 3 ? segments : segments / 2; // More MOVE parts for lower level controllers to help with efficiency, later we should have roads to the controller which will reduce the need for MOVE parts.

    // Build body parts with ratio: 1 WORK, 1 CARRY, 1 MOVE per segment
    for (let i = 0; i < segments; i++) bodyPartConstants.push(WORK);
    for (let i = 0; i < carryParts; i++) bodyPartConstants.push(CARRY);
    for (let i = 0; i < moveParts; i++) bodyPartConstants.push(MOVE);

    return new SpawnTask(CreepType.Upgrader, this.areaId, bodyPartConstants, this);
  }

  private findSomwhereToCollectEnergyFrom(creep: CreepBase): void {
    if (this.containerNextToController && this.containerNextToController.store[RESOURCE_ENERGY] > 0) {
      creep.addTask(new CreepTask(Activity.Collect, this.containerNextToController.pos));
    } else if (this.linkNextToController && this.linkNextToController.store[RESOURCE_ENERGY] > 0) {
      creep.addTask(new CreepTask(Activity.Collect, this.linkNextToController.pos));
    } else {
      const storagesAndContainers: (
        | StructureStorage
        | StructureContainer
      )[] = this.getGeneralStoreToCollectFrom().filter(
        store => store instanceof StructureContainer && store.store[RESOURCE_ENERGY] > 500
      ) as StructureContainer[];
      const roomStorage = GetRoomObjects.getRoomStorage(this.room);
      if (roomStorage && roomStorage.store[RESOURCE_ENERGY] > 1000) {
        storagesAndContainers.push(roomStorage);
      }
      const collectFromGeneralStoreSorted = storagesAndContainers.sort(
        (a, b) => a.pos.getRangeTo(creep.pos.x, creep.pos.y) - b.pos.getRangeTo(creep.pos.x, creep.pos.y)
      );
      for (let j = 0; j < collectFromGeneralStoreSorted.length; j++) {
        creep.addTask(new CreepTask(Activity.Collect, collectFromGeneralStoreSorted[j].pos));
        break;
      }
    }
  }
}
