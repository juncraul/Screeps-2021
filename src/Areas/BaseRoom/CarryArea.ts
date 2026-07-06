import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "../BaseArea";
import { CreepBase } from "CreepBase";
import { Helper } from "Helpers/Helper";

export default class CarryArea extends BaseArea {
  controller: StructureController;
  maxWorkerCount: number;
  controllerLevel: number;
  containerNextToController: StructureContainer | null;
  spawns: StructureSpawn[];
  extensions: StructureExtension[];
  depositToGeneralStore: StructureContainer[];
  depositToLimitedStore: (StructureSpawn | StructureExtension | StructureTower | StructureLink)[];
  collectFromGeneralStore: (StructureContainer | Ruin)[];
  collectFromLimitedStore: StructureLink[];
  droppedResourcesToCollectFrom: Resource[];
  mineralContainer: { container: StructureContainer; resourceType: ResourceConstant } | null;
  storage: StructureStorage | null;

  constructor(controller: StructureController) {
    super("CarryArea", controller.room.name, controller.pos, controller.room);
    this.controller = controller;
    this.maxWorkerCount = 1;
    this.controllerLevel = controller.level;
    this.containerNextToController = GetRoomObjects.getWithinRangeContainer(controller.pos, 2);
    this.spawns = GetRoomObjects.getRoomSpawns(controller.room, true);
    this.extensions = GetRoomObjects.usesLayoutFixedExtension(controller.room)
      ? []
      : GetRoomObjects.getRoomExtensions(controller.room, true);
    this.depositToGeneralStore = this.getGeneralDeposits();
    this.depositToLimitedStore = this.getLimitedDeposits();
    this.collectFromGeneralStore = this.getGeneralStoreToCollectFrom();
    this.collectFromLimitedStore = this.getLimitedStoreToCollectFrom();
    this.droppedResourcesToCollectFrom = this.getDroppedResourcesToCollectFrom(RESOURCE_ENERGY);
    this.mineralContainer = this.getMineralContainer();
    this.storage = GetRoomObjects.getRoomStorage(controller.room);
  }

  public handleSpawnTasks(): SpawnTask[] {
    const tasksForThisArea: SpawnTask[] = [];
    if (
      this.creeps.length <
      this.maxWorkerCount + this.getNumberOfDyingCreeps() + (this.doWeNeedToReplaceWeakCreep() ? 1 : 0)
    ) {
      const task: SpawnTask | null = this.createCreepForThisArea();
      if (task) {
        tasksForThisArea.push(task);
      }
    }
    return tasksForThisArea;
  }

  public handleThisArea() {
    for (let i = 0; i < this.creeps.length; i++) {
      if (!this.creeps[i].isFree()) continue;

      const creep = this.creeps[i];

      if (creep.isEmpty()) {
        // If the creep was last carrying minerals, try to refill with minerals first.
        if (this.tryCollectMineral(creep)) return;
        this.findSomewhereToCollectFrom(creep);
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

    const mineralContainer = this.getMineralContainer();
    if (!mineralContainer) return false;

    const { container, resourceType } = mineralContainer;
    const available = container.store.getUsedCapacity(resourceType);
    if (available === null || available < creep.carryCapacity) {
      // Not enough to fill the creep completely — skip mineral collection this trip.
      return false;
    }
    if (storage.store.getFreeCapacity() === 0) return false;
    creep.addTask(new CreepTask(Activity.CollectMineral, container.pos, null, resourceType));
    return true;
  }

  private depositMineralToStorage(creep: CreepBase, resourceType: ResourceConstant): void {
    const storage = GetRoomObjects.getRoomStorage(this.room);
    if (storage && storage.store.getFreeCapacity() > 0) {
      creep.addTask(new CreepTask(Activity.DepositMineral, storage.pos, null, resourceType));
    }
  }

  private getMineralContainer(): { container: StructureContainer; resourceType: ResourceConstant } | null {
    const result: { container: StructureContainer; resourceType: ResourceConstant }[] = [];
    if (this.controllerLevel < 6) return null;
    const mineral = GetRoomObjects.getRoomMineral(this.room, false);
    if (!mineral) return null;
    const container = GetRoomObjects.getWithinRangeContainer(mineral.pos, 2);
    if (!container) return null;
    const mineralType = mineral.mineralType as ResourceConstant;
    if (container.store.getUsedCapacity(mineralType)! > 0) {
      result.push({ container, resourceType: mineralType });
    }
    return result[0] ?? null;
  }

  private findSomewhereToCollectFrom(creep: CreepBase): void {
    // Disabled, we should never collect from links. This is for Utility creeps to use.
    // for (let j = 0; j < this.collectFromLimitedStore.length; j++) {
    //   if (this.collectFromLimitedStore[j].store.energy < 100) continue;
    //   creep.addTask(new CreepTask(Activity.Collect, this.collectFromLimitedStore[j].pos));
    //   return;
    // }
    // In case we put energy by mistake in the mineral container, we should collect it from there.
    const mineralContainer = this.getMineralContainer();
    if (mineralContainer && mineralContainer.container.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      creep.addTask(new CreepTask(Activity.Collect, mineralContainer.container.pos));
      return;
    }

    // TODO: I have noticed that sometimes when there is 2000 energy in container and 300 resource dropped on the ground, creeps will go for the dropped resource instead of the container.
    const firstDroppedResource = creep.pos.findClosestByPath(
      this.droppedResourcesToCollectFrom.filter(resource => resource.amount > creep.carryCapacity / 2)
    );
    if (firstDroppedResource) {
      creep.addTask(new CreepTask(Activity.Pickup, firstDroppedResource.pos));
      return;
    }

    const firstContainer = creep.pos.findClosestByPath(
      this.collectFromGeneralStore.filter(
        store => store.store.getUsedCapacity(RESOURCE_ENERGY) > creep.carryCapacity / 2
      )
    );
    if (firstContainer) {
      creep.addTask(new CreepTask(Activity.Collect, firstContainer.pos));
      return;
    }

    // Check if this room has stationary fillers, this is because we don't have utilities in these rooms.
    const stationaryFillers = GetRoomObjects.usesLayoutFixedExtension(this.room);
    if (stationaryFillers) {
      const storage = GetRoomObjects.getRoomStorage(this.room);
      if (storage && storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        creep.addTask(new CreepTask(Activity.Collect, storage.pos));
        return;
      }
    }
  }

  private findSomewhereToDeposit(creep: CreepBase): void {
    // Check if we have an utility creep in UtilityArea
    const creepsInUtilityArea = Helper.getCreepNamesFromArea("UtilityArea", this.room.name);
    if (
      creepsInUtilityArea &&
      creepsInUtilityArea.length > 0 &&
      !(
        creepsInUtilityArea.length === 1 &&
        Game.creeps[creepsInUtilityArea[0]] && // This might be undefined, even though creepsInUtilityArea.length is 1. Adding this extra check to prevent that. Observed after utility died.
        Game.creeps[creepsInUtilityArea[0]].spawning === true
      )
    ) {
      if (this.storage && this.storage.store.getUsedCapacity(RESOURCE_ENERGY) < 2000) {
        this.depositToStorage(creep);
        return;
      }

      if (this.depositToFirstGeneralStore(creep)) return;
      if (this.depositToFirstLimitedStore(creep)) return;
    } else {
      if (this.depositToFirstLimitedStore(creep)) return;
      if (this.depositToFirstGeneralStore(creep)) return;
    }
  }

  private depositToStorage(creep: CreepBase): void {
    if (this.storage && this.storage.store.getFreeCapacity() > 0) {
      creep.addTask(new CreepTask(Activity.Deposit, this.storage.pos));
    }
  }

  private depositToFirstLimitedStore(creep: CreepBase): boolean {
    const depositToLimitedStoreSorted = this.depositToLimitedStore.sort((a, b) => {
      const aIsTower = a.structureType === STRUCTURE_TOWER;
      const bIsTower = b.structureType === STRUCTURE_TOWER;

      if (aIsTower && !bIsTower) return 1;
      if (!aIsTower && bIsTower) return -1;

      return a.pos.getRangeTo(creep.pos.x, creep.pos.y) - b.pos.getRangeTo(creep.pos.x, creep.pos.y);
    });
    for (let j = 0; j < depositToLimitedStoreSorted.length; j++) {
      if (depositToLimitedStoreSorted[j].store.getFreeCapacity(RESOURCE_ENERGY) === 0) continue;
      creep.addTask(new CreepTask(Activity.Deposit, depositToLimitedStoreSorted[j].pos));
      return true;
    }
    return false;
  }

  private depositToFirstGeneralStore(creep: CreepBase): boolean {
    const deposit = creep.pos.findClosestByPath(
      this.depositToGeneralStore.filter(store => store.store.getFreeCapacity(RESOURCE_ENERGY) > 500)
    );
    if (deposit) {
      creep.addTask(new CreepTask(Activity.Deposit, deposit.pos));
      return true;
    }
    return false;
  }

  private getGeneralDeposits(): StructureContainer[] {
    const structures: StructureContainer[] = [];
    if (this.containerNextToController) structures.push(this.containerNextToController);
    const spawn = GetRoomObjects.getRoomSpawns(this.room, true)[0];
    if (spawn) {
      const potentialContainers = GetRoomObjects.getWithinRangeContainers(spawn.pos, 4);
      structures.push(...potentialContainers);
    }
    const storage = GetRoomObjects.getRoomStorage(this.room);
    if (storage) {
      const potentialContainers = GetRoomObjects.getWithinRangeContainers(storage.pos, 4);
      structures.push(...potentialContainers);
    }
    return structures;
  }

  private getLimitedDeposits(): (StructureSpawn | StructureExtension | StructureTower | StructureLink)[] {
    const structures: (StructureSpawn | StructureExtension | StructureTower | StructureLink)[] = [];
    this.extensions.forEach(extension => {
      if (extension.store.getFreeCapacity(RESOURCE_ENERGY) > 0) structures.push(extension);
    });
    this.spawns.forEach(spawn => {
      if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) structures.push(spawn);
    });
    GetRoomObjects.getRoomTowers(this.room).forEach(tower => {
      if (tower.store.getFreeCapacity(RESOURCE_ENERGY) > 200) structures.push(tower);
    });
    // GetRoomObjects.getRoomSources(this.room).forEach(source =>{
    //   let potentialLink = GetRoomObjects.getWithinRangeLink(source.pos, 3);
    //   if(potentialLink && potentialLink.store.getFreeCapacity(RESOURCE_ENERGY) !== 0)
    //     structures.push(potentialLink)
    // })
    return structures;
  }

  private createCreepForThisArea(): SpawnTask | null {
    const bodyPartConstants: BodyPartConstant[] = [];
    const leaveAmountEnergyUnused = this.room.energyCapacityAvailable / 100 > 10 ? 300 : 0; // Don't wait for a full refill if we have a lot of energy capacity, but if we have less than 1000 energy capacity, wait for a full refill.
    let segments = Math.floor((this.room.energyCapacityAvailable - leaveAmountEnergyUnused) / 100); // Carry-50; Move-50
    if (this.creeps.length === 0) {
      // Note: In this situation, there is no way to fill extensions
      // Use energyAvailable to setup the segments with 3 as a cap. A.k.a. wait till Spawn has 300 energy.
      segments = Math.floor(this.room.energyAvailable / 100) < 3 ? Math.floor(this.room.energyAvailable / 100) : 3;
    }
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
