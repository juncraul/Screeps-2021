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
  upgradePosition: RoomPosition;

  constructor(controller: StructureController) {
    super("UpgradeArea", controller.id, controller.pos, controller.room);
    this.controller = controller;
    this.controllerLevel = controller.level;
    this.containerNextToController = GetRoomObjects.getContainerNextToController(controller.room);
    this.linkNextToController = GetRoomObjects.getLinkNextToController(controller.room);
    this.containerConstructionSiteNextToController = GetRoomObjects.getWithinRangeConstructionSite(
      controller.pos,
      3,
      STRUCTURE_CONTAINER
    );
    this.maxWorkerCount = this.calculateMaxWorkerCount();
    this.linkConstructionSiteNextToController = GetRoomObjects.getWithinRangeConstructionSite(
      controller.pos,
      2,
      STRUCTURE_LINK
    );
    this.upgradePosition = Helper.getFreeAdjacentPositions(controller.pos, 1, 1)[0];
  }

  public handleThisArea() {
    this.handleSetup();
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

  private handleSetup() {
    if (this.controllerLevel < 3 && this.creeps.length < 2) return;

    if (!this.containerNextToController && !this.containerConstructionSiteNextToController) {
      const positionForContainer = this.getBestPositionForContainer();
      if (positionForContainer) {
        this.room.createConstructionSite(positionForContainer, STRUCTURE_CONTAINER);
      } else {
        console.log("UpgradeArea: No position for container next to controller");
      }
    }

    if (this.controllerLevel < 6) return;

    if (!this.linkNextToController && !this.linkConstructionSiteNextToController && this.containerNextToController) {
      const positionForLink = this.getBestPositionForContainer();
      if (positionForLink) {
        this.room.createConstructionSite(positionForLink, STRUCTURE_LINK);
      } else {
        console.log("UpgradeArea: No position for link next to controller");
      }
    }
  }

  private handleCreeps() {
    for (const creep of this.creeps) {
      // Container construction site appeared, cancel the upgrade.
      if (this.containerConstructionSiteNextToController && creep.task?.activity === Activity.Upgrade) {
        creep.task.taskDone = true;
      }
      if (!creep.isFree()) {
        // We might want to interup a move activity
        continue;
      }

      if (creep.isEmpty()) {
        if (this.findSomwhereToCollectEnergyFrom(creep)) continue;
        if (creep.pos.getRangeTo(this.upgradePosition) > 4) {
          // const pos = GetRoomObjects.getXStepTowardsTarget(this.upgradePosition, creep.pos, 1);
          creep.addTask(new CreepTask(Activity.Move, this.upgradePosition, null, null, false, 3));
        }
      } else {
        // Build the construction site(Container) or do the main job, which is upgrade the controller.
        if (this.containerConstructionSiteNextToController && this.controller.ticksToDowngrade > 8000) {
          creep.addTask(new CreepTask(Activity.Construct, this.containerConstructionSiteNextToController.pos));
        } else {
          creep.addTask(new CreepTask(Activity.Upgrade, this.controller.pos));
        }
      }
    }
  }

  private calculateMaxWorkerCount(): number {
    // For level 8 there is no point having more than one upgrader.
    if (this.controllerLevel === 8) {
      return 1;
    }
    // if (this.controllerLevel < 3) {
    //   return 6;
    // }

    const availableUpgradeEnergy = this.getAvailableUpgradeEnergy();
    const workBodyPartsFromCreeps = this.creeps.reduce(
      (total, creep) => total + creep.creep.getActiveBodyparts(WORK),
      0
    );
    let carryBodyPartsNeeded = 1;

    if (availableUpgradeEnergy > 100000) carryBodyPartsNeeded = 60;
    else if (availableUpgradeEnergy >= 40000) carryBodyPartsNeeded = 50;
    else if (availableUpgradeEnergy >= 30000) carryBodyPartsNeeded = 40;
    else if (availableUpgradeEnergy >= 10000) carryBodyPartsNeeded = 30;
    else if (availableUpgradeEnergy >= 5000) carryBodyPartsNeeded = 20;
    else if (availableUpgradeEnergy >= 2000) carryBodyPartsNeeded = 15;
    else if (availableUpgradeEnergy >= 1000) carryBodyPartsNeeded = 10;
    else if (availableUpgradeEnergy >= 500) carryBodyPartsNeeded = 7;
    else if (availableUpgradeEnergy < 500) carryBodyPartsNeeded = 4;
    if (workBodyPartsFromCreeps >= carryBodyPartsNeeded) return this.creeps.length;
    return Math.min(8, this.creeps.length + 1);
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
    } else if (segments >= 10) {
      segments = 10;
    }

    const carryParts = this.containerNextToController ? 1 : segments;

    const moveParts = this.controllerLevel <= 3 ? segments : segments / 2; // More MOVE parts for lower level controllers to help with efficiency, later we should have roads to the controller which will reduce the need for MOVE parts.

    // Build body parts with ratio: 1 WORK, 1 CARRY, 1 MOVE per segment
    for (let i = 0; i < segments; i++) bodyPartConstants.push(WORK);
    for (let i = 0; i < carryParts; i++) bodyPartConstants.push(CARRY);
    for (let i = 0; i < moveParts; i++) bodyPartConstants.push(MOVE);

    return new SpawnTask(CreepType.Upgrader, this.areaId, bodyPartConstants, this);
  }

  private findSomwhereToCollectEnergyFrom(creep: CreepBase): boolean {
    if (this.linkNextToController && this.linkNextToController.store[RESOURCE_ENERGY] > 0) {
      creep.addTask(new CreepTask(Activity.Collect, this.linkNextToController.pos));
      return true;
    } else if (this.containerNextToController && this.containerNextToController.store[RESOURCE_ENERGY] > 0) {
      creep.addTask(new CreepTask(Activity.Collect, this.containerNextToController.pos));
      return true;
    }
    return false;
    // Disabled this, this is logic moves the creep away from upgrade area.
    // else {
    //   const storagesAndContainers: (
    //     | StructureStorage
    //     | StructureContainer
    //   )[] = this.getGeneralStoreToCollectFrom().filter(
    //     store => store instanceof StructureContainer && store.store[RESOURCE_ENERGY] > 500
    //   ) as StructureContainer[];
    //   const roomStorage = GetRoomObjects.getRoomStorage(this.room);
    //   if (roomStorage && roomStorage.store[RESOURCE_ENERGY] > 1000) {
    //     storagesAndContainers.push(roomStorage);
    //   }
    //   const collectFromGeneralStoreSorted = storagesAndContainers.sort(
    //     (a, b) => a.pos.getRangeTo(creep.pos.x, creep.pos.y) - b.pos.getRangeTo(creep.pos.x, creep.pos.y)
    //   );
    //   for (let j = 0; j < collectFromGeneralStoreSorted.length; j++) {
    //     creep.addTask(new CreepTask(Activity.Collect, collectFromGeneralStoreSorted[j].pos));
    //     break;
    //   }
    // }
  }

  private getBestPositionForContainer(): RoomPosition | null {
    const positions = Helper.getFreeAdjacentPositions(this.controller.pos, 2, 3);
    let maxFreeAdjacentPositions = 0;
    let bestPosition: RoomPosition | null = null;

    for (const pos of positions) {
      const freeAdjacentPositions = Helper.getFreeAdjacentPositions(pos, 1, 2);
      if (freeAdjacentPositions.length > maxFreeAdjacentPositions) {
        maxFreeAdjacentPositions = freeAdjacentPositions.length;
        bestPosition = pos;
      }
    }

    return bestPosition;
  }
}
