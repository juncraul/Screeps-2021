import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "../BaseArea";

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
        const structureToDeposit = this.getWhereToDeposit(this.creeps[i].pos);
        if (structureToDeposit) {
          this.creeps[i].addTask(new CreepTask(Activity.Deposit, structureToDeposit.pos));
        } else if (this.storage) {
          this.creeps[i].addTask(new CreepTask(Activity.Deposit, this.storage.pos));
        }
      }
    }
  }

  private getWhereToDeposit(
    currentPosition: RoomPosition
  ): StructureSpawn | StructureExtension | StructureTower | null {
    const extensions = this.room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_EXTENSION
    }) as StructureExtension[];
    const spawns = this.room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_SPAWN
    }) as StructureSpawn[];
    const towers = this.room.find(FIND_MY_STRUCTURES, {
      filter: structure =>
        structure.structureType === STRUCTURE_TOWER && structure.store.getFreeCapacity(RESOURCE_ENERGY) < 950
    }) as StructureTower[];

    // Disabled spawns for now because it is too far away
    // if (this.room.name === "E29S25" && extensions.length !== 0 && towers.length !== 0) {
    //   spawns = [];
    // }

    const structures = [...extensions, ...towers, ...spawns].filter(
      structure => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    );
    if (structures.length === 0) {
      return null;
    }
    const closestStructure = currentPosition.findClosestByRange(structures);
    return closestStructure;
  }

  private createCreepForThisArea(): SpawnTask | null {
    const bodyPartConstants: BodyPartConstant[] = [];
    const segments = Math.min(15, Math.floor(this.room.energyCapacityAvailable / 100)); // Carry-50; Move-50
    if (segments < 1) {
      console.log(`Error: Trying to spawn a carrier with segments ${segments} less than 1`);
      return null;
    } else {
      const moveParts = segments / 2;
      for (let i = 0; i < segments; i++) bodyPartConstants.push(CARRY);
      for (let i = 0; i < moveParts; i++) bodyPartConstants.push(MOVE);
    }
    return new SpawnTask(CreepType.Utility, this.areaId, bodyPartConstants, this);
  }
}
