import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "../BaseArea";
import { CreepBase } from "CreepBase";
import { Helper } from "Helpers/Helper";
import StationaryFillerArea from "./StationaryFillerArea";

export default class CarryArea extends BaseArea {
  controller: StructureController;
  maxWorkerCount: number;
  controllerLevel: number;
  containerNextToController: StructureContainer | null;
  spawns: StructureSpawn[];
  extensions: StructureExtension[];
  extensionsAndSpawns: (StructureExtension | StructureSpawn)[];
  collectFromGeneralStore: (StructureContainer | Ruin)[];
  collectFromLimitedStore: StructureLink[];
  droppedResourcesToCollectFrom: Resource[];
  mineralContainer: StructureContainer | null;
  storage: StructureStorage | null;

  constructor(controller: StructureController) {
    super("CarryArea", controller.room.name, controller.pos, controller.room);
    this.controller = controller;
    this.maxWorkerCount = 1;
    this.controllerLevel = controller.level;
    this.containerNextToController = GetRoomObjects.getContainerNextToController(controller.room);
    this.spawns = GetRoomObjects.getRoomSpawns(controller.room, true);
    this.extensions = GetRoomObjects.getRoomExtensions(this.room, true);
    this.extensionsAndSpawns = [...this.spawns, ...this.extensions];
    this.collectFromGeneralStore = this.getGeneralStoreToCollectFrom();
    this.collectFromLimitedStore = this.getLimitedStoreToCollectFrom();
    this.droppedResourcesToCollectFrom = this.getDroppedResourcesToCollectFrom(RESOURCE_ENERGY);
    this.mineralContainer = GetRoomObjects.getContainerNextToMineral(controller.room);
    this.storage = GetRoomObjects.getRoomStorage(controller.room);
    this.maxWorkerCount = this.calculateMaxWorkerCount();
  }

  public handleThisArea() {
    this.handleCreeps();
  }

  public handleSpawnTasks(): SpawnTask[] {
    const tasksForThisArea: SpawnTask[] = [];
    const allowedWorkerCount =
      this.maxWorkerCount + this.getNumberOfDyingCreeps() + (this.doWeNeedToReplaceWeakCreep() ? 1 : 0);

    if (this.creeps.length < allowedWorkerCount) {
      const task: SpawnTask | null = this.createCreepForThisArea();
      if (task) {
        tasksForThisArea.push(task);
      }
    }
    return tasksForThisArea;
  }

  private handleCreeps() {
    for (const creep of this.creeps) {
      this.interupCurrentTaskIfNeeded(creep);

      if (!creep.isFree()) continue;

      if (creep.isEmpty()) {
        // If the creep was last carrying minerals, try to refill with minerals first.
        if (this.tryCollectMineral(creep)) continue;
        if (this.findSomewhereToCollectFrom(creep)) continue;
        if (this.moveToDroppedResourceNearSource(creep)) continue;
      } else {
        // Creep has something — decide which deposit logic to use based on what it's carrying.
        const mineralResource = this.getCarriedMineralType(creep);
        if (mineralResource) {
          this.depositMineralToStorage(creep, mineralResource);
        } else {
          this.findSomewhereToDeposit(creep);
        }
      }
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private interupCurrentTaskIfNeeded(creep: CreepBase): void {
    if (!creep.task) return;
    if (creep.task.activity === Activity.Collect) {
      const targetCollect: Structure | Tombstone | Ruin | null = CreepTask.getStructureFromTargetNoRoadNoRampart(
        creep.task.targetPlace
      );
      if (
        targetCollect instanceof StructureContainer ||
        targetCollect instanceof Ruin ||
        targetCollect instanceof Tombstone
      ) {
        // Someone else has already emptied the container, ruin, or tombstone. Cancel the task.
        if (targetCollect.store.getUsedCapacity(RESOURCE_ENERGY) <= 20) {
          creep.task = null;
        }
      }
    }
  }

  private getCarriedMineralType(creep: CreepBase): ResourceConstant | null {
    for (const resourceType in creep.store) {
      if (resourceType !== RESOURCE_ENERGY && (creep.store[resourceType as ResourceConstant] ?? 0) > 0) {
        return resourceType as ResourceConstant;
      }
    }
    return null;
  }

  private tryCollectMineral(creep: CreepBase): boolean {
    const storage = GetRoomObjects.getRoomStorage(this.room);
    if (!storage) return false;

    if (!this.mineralContainer) return false;

    const mineral = this.room.find(FIND_MINERALS)[0];
    if (!mineral) return false;
    const resourceType = mineral.mineralType as ResourceConstant;
    const available = this.mineralContainer.store.getUsedCapacity(resourceType);
    if (available === null || available < creep.carryCapacity) {
      // Not enough to fill the creep completely — skip mineral collection this trip.
      return false;
    }
    if (storage.store.getFreeCapacity() === 0) return false;
    creep.addTask(new CreepTask(Activity.CollectMineral, this.mineralContainer.pos, null, resourceType));
    return true;
  }

  private depositMineralToStorage(creep: CreepBase, resourceType: ResourceConstant): void {
    const storage = GetRoomObjects.getRoomStorage(this.room);
    if (storage && storage.store.getFreeCapacity() > 0) {
      creep.addTask(new CreepTask(Activity.DepositMineral, storage.pos, null, resourceType));
    }
  }

  private findSomewhereToCollectFrom(creep: CreepBase): boolean {
    // Disabled, we should never collect from links. This is for Utility creeps to use.
    // for (let j = 0; j < this.collectFromLimitedStore.length; j++) {
    //   if (this.collectFromLimitedStore[j].store.energy < 100) continue;
    //   creep.addTask(new CreepTask(Activity.Collect, this.collectFromLimitedStore[j].pos));
    //   return;
    // }
    // In case we put energy by mistake in the mineral container, we should collect it from there.
    if (this.mineralContainer && this.mineralContainer.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      creep.addTask(new CreepTask(Activity.Collect, this.mineralContainer.pos));
      return true;
    }

    // TODO: I have noticed that sometimes when there is 2000 energy in container and 300 resource dropped on the ground, creeps will go for the dropped resource instead of the container.
    const firstDroppedResource = creep.pos.findClosestByPath(
      this.droppedResourcesToCollectFrom.filter(resource => resource.amount >= creep.carryCapacity)
    );
    if (firstDroppedResource) {
      creep.addTask(new CreepTask(Activity.Pickup, firstDroppedResource.pos));
      return true;
    }

    const firstDroppedResourceHalfAmount = creep.pos.findClosestByPath(
      this.droppedResourcesToCollectFrom.filter(resource => resource.amount >= creep.carryCapacity / 2)
    );
    if (firstDroppedResourceHalfAmount) {
      creep.addTask(new CreepTask(Activity.Pickup, firstDroppedResourceHalfAmount.pos));
      return true;
    }

    const firstContainer = creep.pos.findClosestByPath(
      this.collectFromGeneralStore.filter(
        store => store.store.getUsedCapacity(RESOURCE_ENERGY) > creep.carryCapacity / 2
      )
    );
    if (firstContainer) {
      creep.addTask(new CreepTask(Activity.Collect, firstContainer.pos));
      return true;
    }

    // Check if this room has stationary fillers, this is because we don't have utilities in these rooms.
    const stationaryFillers = GetRoomObjects.usesLayoutFixedExtension(this.room);
    if (stationaryFillers) {
      const storage = GetRoomObjects.getRoomStorage(this.room);
      if (storage && storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        creep.addTask(new CreepTask(Activity.Collect, storage.pos));
        return true;
      }
    }
    return false;
  }

  private moveToDroppedResourceNearSource(creep: CreepBase): boolean {
    const allDroppedResources = this.room.find(FIND_DROPPED_RESOURCES);
    const droppedResourcesNextToSources = allDroppedResources.filter(resource => {
      const sources = this.room.find(FIND_SOURCES);
      return sources.some(source => resource.pos.isNearTo(source.pos));
    });
    const firstDroppedResource = creep.pos.findClosestByPath(droppedResourcesNextToSources);
    if (firstDroppedResource) {
      const pos = GetRoomObjects.getXStepTowardsTarget(firstDroppedResource.pos, creep.pos, 2);
      creep.addTask(new CreepTask(Activity.Move, pos));
      return true;
    }
    return false;
  }

  private findSomewhereToDeposit(creep: CreepBase): void {
    if (this.weHaveCreepsInUtilityArea()) {
      if (this.storage && this.storage.store.getUsedCapacity(RESOURCE_ENERGY) < 2000) {
        this.depositToStorage(creep);
        return;
      }

      if (this.depositToTowers(creep)) return;
      if (this.depositToUpgradeArea(creep)) return;
      if (this.depositToConstructionWorkers(creep)) return;
      if (this.depositToStorage(creep)) return;
    } else {
      if (this.depositToSpawningArea(creep)) return;
      if (this.depositToTowers(creep)) return;
      if (this.depositToUpgradeArea(creep)) return;
      if (this.depositToConstructionWorkers(creep)) return;
      if (this.depositToStorage(creep)) return;
    }
  }

  private weHaveCreepsInUtilityArea(): boolean {
    const creepsInUtilityArea = Helper.getCreepNamesFromArea("UtilityArea", this.room.name);
    return (
      creepsInUtilityArea &&
      creepsInUtilityArea.length > 0 &&
      !(
        creepsInUtilityArea.length === 1 &&
        Game.creeps[creepsInUtilityArea[0]] && // This might be undefined, even though creepsInUtilityArea.length is 1. Adding this extra check to prevent that. Observed after utility died.
        Game.creeps[creepsInUtilityArea[0]].spawning === true
      )
    );
  }

  private depositToStorage(creep: CreepBase): boolean {
    if (this.storage && this.storage.store.getFreeCapacity() > 0) {
      creep.addTask(new CreepTask(Activity.Deposit, this.storage.pos));
      return true;
    }
    return false;
  }

  private depositToSpawningArea(creep: CreepBase): boolean {
    const stationaryFillers = GetRoomObjects.usesLayoutFixedExtension(this.room);
    const containersNextToSpawns = StationaryFillerArea.getContainers(this.room);
    // Fill containers next to spawns first if we have stationary fillers, otherwise fill extensions and spawns.
    if (stationaryFillers && containersNextToSpawns.length > 0) {
      const closestContainer = creep.pos.findClosestByPath(
        containersNextToSpawns.filter(cont => cont.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
      );
      if (closestContainer && closestContainer.store.getFreeCapacity(RESOURCE_ENERGY) > 500) {
        creep.addTask(new CreepTask(Activity.Deposit, closestContainer.pos));
        return true;
      }
      const extensionsAndSpawns = StationaryFillerArea.getExtensionsAndSpawnsFromStationaryFillerArea(this.room);
      const closestExtensionOrSpawn = creep.pos.findClosestByPath(
        this.extensionsAndSpawns
          .filter(structure => !extensionsAndSpawns.some(pos => structure.pos.isEqualTo(pos)))
          .filter(structure => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
      );
      if (closestExtensionOrSpawn) {
        creep.addTask(new CreepTask(Activity.Deposit, closestExtensionOrSpawn.pos));
        return true;
      }
    } else {
      const closestExtensionOrSpawn = creep.pos.findClosestByPath(
        this.extensionsAndSpawns.filter(structure => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
      );
      if (closestExtensionOrSpawn) {
        creep.addTask(new CreepTask(Activity.Deposit, closestExtensionOrSpawn.pos));
        return true;
      }
    }
    return false;
  }

  private depositToTowers(creep: CreepBase): boolean {
    const towers = GetRoomObjects.getRoomTowers(this.room).filter(
      tower => tower.store.getFreeCapacity(RESOURCE_ENERGY) > 100
    );
    if (towers.length > 0) {
      const closestTower = creep.pos.findClosestByPath(towers);
      if (closestTower) {
        creep.addTask(new CreepTask(Activity.Deposit, closestTower.pos));
        return true;
      }
    }
    return false;
  }

  private depositToConstructionWorkers(creep: CreepBase): boolean {
    // Deposit to Construction workers.
    const constructionCreepsNames = Helper.getCreepNamesFromArea("ConstructionArea", this.room.name);
    for (let i = 0; i < constructionCreepsNames.length; i++) {
      const constructionCreep = Game.creeps[constructionCreepsNames[i]];
      if (constructionCreep && constructionCreep.store.getUsedCapacity(RESOURCE_ENERGY) < 20) {
        creep.addTask(new CreepTask(Activity.Deposit, constructionCreep.pos));
        return true;
      }
    }
    return false;
  }

  private depositToUpgradeArea(creep: CreepBase): boolean {
    // Deposit to creeps in UpgradeArea if we don't have a container next to the controller.
    if (this.containerNextToController && this.containerNextToController.store.getFreeCapacity(RESOURCE_ENERGY) > 500) {
      creep.addTask(new CreepTask(Activity.Deposit, this.containerNextToController.pos));
      return true;
    } else {
      const upgradeCreepNames = Helper.getCreepNamesFromArea("UpgradeArea", this.controller.id);
      for (const upgradeCreepName of upgradeCreepNames) {
        const upgradeCreep = Game.creeps[upgradeCreepName];
        if (upgradeCreep && upgradeCreep.store.getUsedCapacity(RESOURCE_ENERGY) < 20) {
          creep.addTask(new CreepTask(Activity.Deposit, upgradeCreep.pos));
          return true;
        }
      }
    }
    return false;
  }

  private calculateMaxWorkerCount(): number {
    const creeps = this.creeps.filter(creep => (creep.ticksToLive ?? 0) > 200);
    const carryBodyPartsFromCreeps = creeps.reduce((total, creep) => total + creep.creep.getActiveBodyparts(CARRY), 0);
    const roomEnergyToCollect = this.getTotalCollectableEnergy();
    let carryBodyPartsNeeded = 1;
    if (roomEnergyToCollect >= 2500) carryBodyPartsNeeded = 30;
    else if (roomEnergyToCollect >= 2000) carryBodyPartsNeeded = 25;
    else if (roomEnergyToCollect >= 1000) carryBodyPartsNeeded = 20;
    else if (roomEnergyToCollect >= 500) carryBodyPartsNeeded = 10;
    else if (roomEnergyToCollect < 500) carryBodyPartsNeeded = 5;
    if (carryBodyPartsFromCreeps >= carryBodyPartsNeeded) return creeps.length;
    return creeps.length + 1;
  }

  private createCreepForThisArea(): SpawnTask | null {
    const bodyPartConstants: BodyPartConstant[] = [];
    const leaveAmountEnergyUnused = this.room.energyCapacityAvailable / 100 > 10 ? 300 : 0; // Don't wait for a full refill if we have a lot of energy capacity, but if we have less than 1000 energy capacity, wait for a full refill.
    let segments = Math.floor((this.room.energyCapacityAvailable - leaveAmountEnergyUnused) / 100); // Carry-50; Move-50
    segments = Math.min(segments, 15);
    if (this.creeps.length === 0) {
      // Note: In this situation, there is no way to fill extensions
      // Use energyAvailable to setup the segments with 3 as a cap. A.k.a. wait till Spawn has 300 energy.
      segments = Math.floor(this.room.energyAvailable / 100) < 3 ? Math.floor(this.room.energyAvailable / 100) : 3;
    }
    // if (this.controller.level === 1) {
    //   if (segments > 1) segments = 1; // Don't spawn more than 1 segment if controller is level 1, because we can't fill extensions anyway.
    // }
    if (segments < 1) {
      console.log(`Error: Trying to spawn a carrier with segments ${segments} less than 1`);
      return null;
    } else {
      for (let i = 0; i < segments; i++) bodyPartConstants.push(CARRY);
      for (let i = 0; i < segments; i++) bodyPartConstants.push(MOVE);
    }

    return new SpawnTask(CreepType.Carrier, this.areaId, bodyPartConstants, this);
  }

  protected doWeNeedToReplaceWeakCreep(): boolean {
    if (this.creeps.length !== 1) {
      return false;
    }
    const creep = this.creeps[0];
    if (creep.body.length <= 6 && this.room.energyCapacityAvailable >= 450) {
      return true;
    }
    return false;
  }
}
