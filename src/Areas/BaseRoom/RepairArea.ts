import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "../BaseArea";

export default class RepairArea extends BaseArea {
  controller: StructureController;
  maxWorkerCount: number;
  containersToCollectFrom: (StructureContainer | Ruin)[];
  droppedResourcesToCollectFrom: Resource[];
  storage: StructureStorage | null;

  constructor(controller: StructureController) {
    super("RepairArea", controller.room.name, controller.pos, controller.room);
    this.controller = controller;
    this.containersToCollectFrom = this.getGeneralStoreToCollectFrom();
    this.droppedResourcesToCollectFrom = this.getDroppedResourcesToCollectFrom(RESOURCE_ENERGY);
    this.storage = GetRoomObjects.getRoomStorage(controller.room);
    this.maxWorkerCount = this.calculateMaxWorkerCount();
  }

  public handleThisArea() {
    this.handleCreeps();
  }

  public handleSpawnTasks(): SpawnTask[] {
    const tasksForThisArea: SpawnTask[] = [];
    if (this.creeps.length < this.maxWorkerCount + this.getNumberOfDyingCreeps()) {
      const task = this.createCreepForThisArea();
      tasksForThisArea.push(task);
    }
    return tasksForThisArea;
  }

  private handleCreeps() {
    for (const creep of this.creeps) {
      if (!creep.isFree()) continue;
      if (creep.pos.roomName !== this.room.name) {
        creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, this.room.name)));
        continue;
      }

      if (creep.isEmpty()) {
        const energyTarget = this.getClosestEnergyTarget(creep.pos);
        if (energyTarget) {
          creep.addTask(new CreepTask(energyTarget.activity, energyTarget.pos));
        } else {
          const closestSource = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
          if (closestSource) {
            creep.addTask(
              new CreepTask(Activity.Move, GetRoomObjects.getXStepTowardsTarget(creep.pos, closestSource.pos, 3))
            );
          }
        }
      } else {
        const structureToRepair = this.getClosestStructureToRepair(creep.pos);
        if (structureToRepair) {
          creep.addTask(new CreepTask(Activity.Repair, structureToRepair.pos));
        }
      }
    }
  }

  private calculateMaxWorkerCount(): number {
    if (this.controller.level < 3) return 0;
    const damagedNonWallCount = this.room.find(FIND_STRUCTURES, {
      filter: structure =>
        structure.structureType !== STRUCTURE_WALL &&
        structure.structureType !== STRUCTURE_RAMPART &&
        structure.hits < structure.hitsMax * 0.9
    }).length;
    const wallOrRampToRepair = GetRoomObjects.getClosestWallRampartToRepairByRange(this.controller.pos);

    if (damagedNonWallCount === 0 && !wallOrRampToRepair) {
      return 0;
    }

    const roomStorage = GetRoomObjects.getRoomStorage(this.room);
    if (damagedNonWallCount >= 25 && roomStorage && roomStorage.store.getUsedCapacity(RESOURCE_ENERGY) > 30000) {
      return 2;
    }

    return 2;
  }

  private getClosestStructureToRepair(pos: RoomPosition): Structure | null {
    let structure = GetRoomObjects.getClosestStructureToRepairByPath(pos, 0.5);
    if (structure) {
      return structure;
    }

    structure = GetRoomObjects.getClosestStructureToRepairByPath(pos, 0.8);
    if (structure) {
      return structure;
    }

    const wallOrRampart = GetRoomObjects.getClosestWallRampartToRepairByPath(pos);
    if (wallOrRampart) {
      return wallOrRampart;
    }

    return GetRoomObjects.getClosestStructureToRepairByPath(pos, 1); // In case all walls are ramparts are full, or we don't have any.
  }

  private getClosestEnergyTarget(
    pos: RoomPosition
  ): { activity: Activity.Collect | Activity.Pickup; pos: RoomPosition } | null {
    let closestPos: RoomPosition | null = null;
    let closestRange = Infinity;
    let activity: Activity.Collect | Activity.Pickup = Activity.Collect;

    for (let i = 0; i < this.containersToCollectFrom.length; i++) {
      if (this.containersToCollectFrom[i].store.getUsedCapacity(RESOURCE_ENERGY) < 100) {
        continue;
      }
      const range = pos.getRangeTo(this.containersToCollectFrom[i].pos);
      if (range < closestRange) {
        closestRange = range;
        closestPos = this.containersToCollectFrom[i].pos;
        activity = Activity.Collect;
      }
    }

    for (let i = 0; i < this.droppedResourcesToCollectFrom.length; i++) {
      if (this.droppedResourcesToCollectFrom[i].amount < 100) {
        continue;
      }
      const range = pos.getRangeTo(this.droppedResourcesToCollectFrom[i].pos);
      if (range < closestRange) {
        closestRange = range;
        closestPos = this.droppedResourcesToCollectFrom[i].pos;
        activity = Activity.Pickup;
      }
    }

    if (this.storage && this.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 200) {
      const range = pos.getRangeTo(this.storage.pos);
      if (range < closestRange) {
        closestPos = this.storage.pos;
        activity = Activity.Collect;
      }
    }

    if (!closestPos) {
      return null;
    }

    return { activity, pos: closestPos };
  }

  private createCreepForThisArea(): SpawnTask {
    const bodyPartConstants: BodyPartConstant[] = [];
    let segments = Math.floor(this.room.energyCapacityAvailable / 200); // WORK-100; CARRY-50; MOVE-50
    if (this.creeps.length === 0) {
      segments = Math.floor(this.room.energyAvailable / 200);
    }
    if (segments < 1) {
      segments = 1;
    }
    if (segments > 5) {
      segments = 5;
    }

    for (let i = 0; i < segments; i++) {
      bodyPartConstants.push(WORK, CARRY, MOVE);
    }

    return new SpawnTask(CreepType.Repairer, this.areaId, bodyPartConstants, this);
  }
}
