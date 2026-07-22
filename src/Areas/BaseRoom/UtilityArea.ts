import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";
import StationaryFillerArea from "./StationaryFillerArea";

export default class UtilityArea extends BaseArea {
  maxWorkerCount: number;
  storage: StructureStorage;
  terminal: StructureTerminal | null;
  link: StructureLink | null;
  labs: StructureLab[];
  spawns: StructureSpawn[];
  extensions: StructureExtension[];
  extensionsAndSpawns: (StructureExtension | StructureSpawn)[];

  constructor(storage: StructureStorage) {
    super("UtilityArea", storage.room.name, storage.pos, storage.room);
    this.maxWorkerCount = 1;
    this.storage = storage;
    this.terminal = GetRoomObjects.getRoomTerminal(storage.room);
    this.link = GetRoomObjects.getWithinRangeLink(storage.pos, 3);
    this.labs = GetRoomObjects.getRoomLabs(storage.room);
    this.spawns = GetRoomObjects.getRoomSpawns(storage.room, true);
    this.extensions = GetRoomObjects.getRoomExtensions(this.room, true);
    this.extensionsAndSpawns = [...this.spawns, ...this.extensions];
  }

  public handleThisArea() {
    this.handleCreeps();
  }

  public handleSpawnTasks(): SpawnTask[] {
    if (this.room.controller && this.room.controller.level < 5) return [];

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

  private handleCreeps() {
    for (const creep of this.creeps) {
      if (!creep.isFree()) continue;

      if (creep.isEmpty()) {
        if (this.link && this.link.store.energy > 100) {
          creep.addTask(new CreepTask(Activity.Collect, this.link.pos));
        } else {
          if (this.storage) {
            creep.addTask(new CreepTask(Activity.Collect, this.storage.pos));
          }
        }
      } else {
        const structureToDeposit = this.getWhereToDeposit(creep.pos);
        if (structureToDeposit) {
          creep.addTask(new CreepTask(Activity.Deposit, structureToDeposit.pos));
        } else if (this.storage) {
          creep.addTask(new CreepTask(Activity.Deposit, this.storage.pos));
        }
      }
    }
  }

  private getWhereToDeposit(
    currentPosition: RoomPosition
  ): StructureSpawn | StructureExtension | StructureTower | StructureContainer | null {
    const stationaryFillerExtensionsAndSpawns = StationaryFillerArea.getExtensionsAndSpawnsFromStationaryFillerArea(
      this.room
    );
    const extensionsAndSpawnsToDepositTo = this.extensionsAndSpawns.filter(
      structure =>
        !stationaryFillerExtensionsAndSpawns.includes(structure) && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    );
    const towers: StructureTower[] = this.room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_TOWER && structure.energy < 850
    });

    if (towers.find(tower => tower.energy < 50)) {
      // If any tower is below 50 energy, prioritize it over extensions and spawns
      extensionsAndSpawnsToDepositTo.length = 0;
    }

    const containersNextToSpawns = StationaryFillerArea.getContainers(this.room).filter(
      container => container.store.getFreeCapacity(RESOURCE_ENERGY) > 100
    );

    const structures = [...extensionsAndSpawnsToDepositTo, ...towers, ...containersNextToSpawns];
    if (structures.length === 0) {
      return null;
    }
    const closestStructure = currentPosition.findClosestByRange(structures);
    return closestStructure;
  }

  private doWeNeedToReplaceWeakCreep(): boolean {
    if (this.creeps.length !== 1) {
      return false;
    }
    const creep = this.creeps[0];
    if (creep.body.length < 5 && this.room.energyCapacityAvailable >= 450) {
      return true;
    }
    return false;
  }

  private createCreepForThisArea(): SpawnTask | null {
    const bodyPartConstants: BodyPartConstant[] = [];
    const haveUtilityCreeps = this.creeps.length > 0;
    const segments = haveUtilityCreeps
      ? Math.min(10, Math.floor(this.room.energyCapacityAvailable / 100))
      : Math.min(10, Math.floor(this.room.energyAvailable / 100)); // Carry-50; Move-50
    if (segments < 1) {
      console.log(
        `Error UtilityArea: Room ${this.room.name} Trying to spawn an utility with segments ${segments} less than 1`
      );
      return null;
    } else {
      const moveParts = segments / 2;
      for (let i = 0; i < segments; i++) bodyPartConstants.push(CARRY);
      for (let i = 0; i < moveParts; i++) bodyPartConstants.push(MOVE);
    }
    return new SpawnTask(CreepType.Utility, this.areaId, bodyPartConstants, this);
  }
}
