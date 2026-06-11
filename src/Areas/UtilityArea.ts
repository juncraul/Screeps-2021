import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";

export default class CarryArea extends BaseArea {
  maxWorkerCount: number;
  storage: StructureStorage;
  terminal: StructureTerminal | null;
  link: StructureLink | null;
  labs: StructureLab[];

  constructor(storage: StructureStorage) {
    super("UtilityArea", storage.room.name, storage.pos, storage.room);
    this.maxWorkerCount = 1;
    this.storage = storage;
    this.terminal = GetRoomObjects.getRoomTerminal(storage.room);
    this.link = GetRoomObjects.getWithinRangeLink(storage.pos, 3);
    this.labs = GetRoomObjects.getRoomLabs(storage.room);
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

      if (this.creeps[i].isEmpty()) {
        if (this.link && this.link.store.energy > 100) {
          this.creeps[i].addTask(new CreepTask(Activity.Collect, this.link.pos));
        } else {
          if (this.storage) {
            this.creeps[i].addTask(new CreepTask(Activity.Collect, this.storage.pos));
          }
        }
      } else {
        var structureToDeposit = this.getWhereToDeposit(this.creeps[i].pos);
        if (structureToDeposit){
          this.creeps[i].addTask(new CreepTask(Activity.Deposit, structureToDeposit.pos));
        } else if (this.storage) {
          this.creeps[i].addTask(new CreepTask(Activity.Deposit, this.storage.pos));
        }
      }
    }
  }

  private getWhereToDeposit(currentPosition: RoomPosition): (StructureSpawn | StructureExtension | StructureTower | null) {

    const extensions = this.room.find(FIND_MY_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_EXTENSION
    }) as StructureExtension[];
    // Disabled spawns for now because it is too far away
    // const spawns = this.room.find(FIND_MY_STRUCTURES, {
    //   filter: (structure) => structure.structureType === STRUCTURE_SPAWN
    // }) as StructureSpawn[];
    const towers = this.room.find(FIND_MY_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_TOWER
    }) as StructureTower[];

    const structures = [...extensions, ...towers].filter(structure => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
    if (structures.length === 0) {
      return null;
    }
    const closestStructure = currentPosition.findClosestByRange(structures);
    return closestStructure;
  }

  private createCreepForThisArea(): SpawnTask | null {
    let bodyPartConstants: BodyPartConstant[] = [];
    const segments = Math.floor(this.room.energyCapacityAvailable / 100); // Carry-50; Move-50
    if (segments < 3) {
      console.log("UtilityArea: Something wrong with room capacity");
    } else if (segments === 3) {
      // 300 energy - 150 Store
      bodyPartConstants = [CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
    } else if (segments === 4) {
      // 400 energy - 200 Store
      bodyPartConstants = [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
    } else if (segments === 5) {
      // 500 energy - 250 Store
      bodyPartConstants = [CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE];
    } else if (segments === 6) {
      // 600 energy - 300 Store
      bodyPartConstants = [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
    } else if (segments === 7) {
      // 700 energy - 350 Store
      bodyPartConstants = [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
    } else if (segments === 8) {
      // 800 energy - 400 Store
      bodyPartConstants = [
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE
      ];
    } else if (segments === 9) {
      // 900 energy - 450 Store
      bodyPartConstants = [
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE
      ];
    } else if (segments === 10) {
      // 1000 energy - 500 Store
      bodyPartConstants = [
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE
      ];
    } else if (segments === 11) {
      // 1100 energy - 550 Store
      bodyPartConstants = [
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE
      ];
    } else if (segments >= 12) {
      // 1200 energy - 600 Store
      bodyPartConstants = [
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        CARRY,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE,
        MOVE
      ];
    }
    return new SpawnTask(SpawnType.Carrier, this.areaId, "Carrier", bodyPartConstants, this);
  }
}
