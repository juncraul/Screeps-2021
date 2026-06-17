import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";
import { CreepBase } from "CreepBase";

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
  mineralContainersByType: { container: StructureContainer; resourceType: ResourceConstant }[];

  constructor(controller: StructureController) {
    super("CarryArea", controller.room.name, controller.pos, controller.room);
    this.controller = controller;
    this.maxWorkerCount = 1;
    this.controllerLevel = controller.level;
    this.containerNextToController = GetRoomObjects.getWithinRangeContainer(controller.pos, 1);
    this.spawns = GetRoomObjects.getRoomSpawns(controller.room, true);
    this.extensions = GetRoomObjects.getRoomExtensions(controller.room, true);
    this.depositToGeneralStore = this.getGeneralDeposits();
    this.depositToLimitedStore = this.getLimitedDeposits();
    this.collectFromGeneralStore = this.getGeneralStoreToCollectFrom();
    this.collectFromLimitedStore = this.getLimitedStoreToCollectFrom();
    this.droppedResourcesToCollectFrom = this.getDroppedResourcesToCollectFrom(RESOURCE_ENERGY);
    this.mineralContainersByType = this.getMineralContainers();
  }

  public handleSpawnTasks(): SpawnTask[] {
    const tasksForThisArea: SpawnTask[] = [];
    if (this.creeps.length < this.maxWorkerCount + this.getNumberOfDyingCreeps()) {
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

    for (const { container, resourceType } of this.mineralContainersByType) {
      const available = container.store.getUsedCapacity(resourceType);
      if (available === null || available < creep.carryCapacity) {
        // Not enough to fill the creep completely — skip mineral collection this trip.
        continue;
      }
      if (storage.store.getFreeCapacity() === 0) continue;
      creep.addTask(new CreepTask(Activity.Collect, container.pos));
      // Store the mineral type in a memory slot so DepositMineral knows what to transfer.
      creep.memory.currentMineralType = resourceType;
      return true;
    }
    return false;
  }

  private depositMineralToStorage(creep: CreepBase, resourceType: ResourceConstant): void {
    const storage = GetRoomObjects.getRoomStorage(this.room);
    if (storage && storage.store.getFreeCapacity() > 0) {
      creep.addTask(new CreepTask(Activity.DepositMineral, storage.pos, null, resourceType));
    }
  }

  private getMineralContainers(): { container: StructureContainer; resourceType: ResourceConstant }[] {
    const result: { container: StructureContainer; resourceType: ResourceConstant }[] = [];
    if (this.controllerLevel < 6) return result;
    const mineral = GetRoomObjects.getRoomMineral(this.room, false);
    if (!mineral) return result;
    const container = GetRoomObjects.getWithinRangeContainer(mineral.pos, 2);
    if (!container) return result;
    const mineralType = mineral.mineralType as ResourceConstant;
    if (container.store.getUsedCapacity(mineralType)! > 0) {
      result.push({ container, resourceType: mineralType });
    }
    return result;
  }

  private findSomewhereToCollectFrom(creep: CreepBase): void {
    for (let j = 0; j < this.collectFromLimitedStore.length; j++) {
      if (this.collectFromLimitedStore[j].store.energy < 100) continue;
      creep.addTask(new CreepTask(Activity.Collect, this.collectFromLimitedStore[j].pos));
      return;
    }
    const collectFromGeneralStoreSorted = this.collectFromGeneralStore.sort(
      (a, b) => a.pos.getRangeTo(creep.pos.x, creep.pos.y) - b.pos.getRangeTo(creep.pos.x, creep.pos.y)
    );
    for (let j = 0; j < collectFromGeneralStoreSorted.length; j++) {
      if (collectFromGeneralStoreSorted[j].store.energy < 200) continue;
      creep.addTask(new CreepTask(Activity.Collect, collectFromGeneralStoreSorted[j].pos));
      return;
    }
    for (let j = 0; j < this.droppedResourcesToCollectFrom.length; j++) {
      if (this.droppedResourcesToCollectFrom[j].amount < 200) continue;
      creep.addTask(new CreepTask(Activity.Pickup, this.droppedResourcesToCollectFrom[j].pos));
      return;
    }
  }

  private findSomewhereToDeposit(creep: CreepBase): void {
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
      return;
    }

    for (let j = 0; j < this.depositToGeneralStore.length; j++) {
      if (this.depositToGeneralStore[j].store.getFreeCapacity(RESOURCE_ENERGY) === 0) continue;
      creep.addTask(new CreepTask(Activity.Deposit, this.depositToGeneralStore[j].pos));
      return;
    }
  }

  private getGeneralDeposits(): StructureContainer[] {
    const structures: StructureContainer[] = [];
    if (this.containerNextToController) structures.push(this.containerNextToController);
    return structures;
  }

  private getLimitedDeposits(): (StructureSpawn | StructureExtension | StructureTower | StructureLink)[] {
    const structures: (StructureSpawn | StructureExtension | StructureTower | StructureLink)[] = [];
    this.extensions.forEach(extension => {
      if (extension.store.getFreeCapacity(RESOURCE_ENERGY) !== 0) structures.push(extension);
    });
    this.spawns.forEach(spawn => {
      if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) !== 0) structures.push(spawn);
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
    let segments = Math.floor(this.room.energyCapacityAvailable / 100); // Carry-50; Move-50
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

    return new SpawnTask(SpawnType.Carrier, this.areaId, "Carrier", bodyPartConstants, this);
  }
}
