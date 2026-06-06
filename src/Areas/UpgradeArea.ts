import { GetRoomObjects } from "Helpers/GetRoomObjects";
import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";

export default class UpgradeArea extends BaseArea {
  controller: StructureController;
  maxWorkerCount: number;
  controllerLevel: number;
  containerNextToController: StructureContainer | null;
  linkNextToController: StructureLink | null;
  containerConstructionSiteNextToController: ConstructionSite | null;

  constructor(controller: StructureController) {
    super("UpgradeArea", controller.id, controller.pos, controller.room);
    this.controller = controller;
    this.controllerLevel = controller.level;
    this.containerNextToController = GetRoomObjects.getWithinRangeContainer(controller.pos, 1);
    this.linkNextToController = GetRoomObjects.getWithinRangeLink(controller.pos, 2);
    this.containerConstructionSiteNextToController = GetRoomObjects.getWithinRangeConstructionSite(
      controller.pos,
      2,
      STRUCTURE_CONTAINER
    );
    this.maxWorkerCount = this.calculateMaxWorkerCount();
  }

  public handleSpawnTasks(): SpawnTask[] {
    const tasksForThisArea: SpawnTask[] = [];
    if (this.creeps.length < this.maxWorkerCount) {
      if (!this.containerNextToController) {
        return tasksForThisArea; // There is no container next to the controller.
      }
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
    if (
      !this.containerNextToController &&
      !this.linkNextToController &&
      !this.containerConstructionSiteNextToController
    ) {
      const positionForContainer = Helper.getFreeAdjacentPositions(this.controller.pos, this.room)[0];
      if (positionForContainer) {
        this.room.createConstructionSite(positionForContainer, STRUCTURE_CONTAINER);
      } else {
        console.log("UpgradeArea: No position for container next to controller");
      }
    }
  }

  private handleCreeps() {
    for (let i: number = this.creeps.length - 1; i >= 0; i--) {
      // Find some resources
      if (this.creeps[i].store.energy === 0 && this.creeps[i].isFree()) {
        if (this.containerNextToController && this.containerNextToController.store[RESOURCE_ENERGY] > 100) {
          this.creeps[i].addTask(new CreepTask(Activity.Collect, this.containerNextToController.pos));
        } else if (this.linkNextToController && this.linkNextToController.store[RESOURCE_ENERGY] > 100) {
          this.creeps[i].addTask(new CreepTask(Activity.Collect, this.linkNextToController.pos));
        } else {
          const structureWithEnergy = this.getGeneralStoreToCollectFrom()[0];
          if (structureWithEnergy) {
            this.creeps[i].addTask(new CreepTask(Activity.Collect, structureWithEnergy.pos));
          }
        }
      }

      // Build the construction site(Container) or do the main job, which is upgrade the controller.
      if (this.creeps[i].isFull() && this.creeps[i].isFree()) {
        if (this.containerConstructionSiteNextToController) {
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
    let maxWorkerCount = 1;

    if (availableUpgradeEnergy >= 1200) {
      maxWorkerCount = 2;
    }
    if (availableUpgradeEnergy >= 2200) {
      maxWorkerCount = 3;
    }
    if (availableUpgradeEnergy >= 3200) {
      maxWorkerCount = 4;
    }

    // Early rooms can still scale up, but keep a safe cap so economy does not starve.
    if (this.controllerLevel <= 2) {
      return Math.min(maxWorkerCount, 4);
    }

    return Math.min(maxWorkerCount, 3);
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

    return availableEnergy;
  }

  private createCreepForThisArea(): SpawnTask {
    let bodyPartConstants: BodyPartConstant[] = [];
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
    
    // Build body parts with ratio: 1 WORK, 1 CARRY, 1 MOVE per segment
    for (let i = 0; i < segments; i++) {
      bodyPartConstants.push(WORK, CARRY, MOVE);
    }
    
    return new SpawnTask(SpawnType.Upgrader, this.areaId, "Upgrader", bodyPartConstants, this);
  }
}
