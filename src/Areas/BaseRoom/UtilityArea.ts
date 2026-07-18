import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";

export default class UtilityArea extends BaseArea {
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

  public handleThisArea() {
    this.handleCreeps();
  }

  public handleSpawnTasks(): SpawnTask[] {
    if (GetRoomObjects.usesLayoutFixedExtension(this.room)) return []; // We don't need utility if we have stationary fillers, they will handle the energy transfer.

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
  ): StructureSpawn | StructureExtension | StructureTower | null {
    let extensions: StructureExtension[] = this.room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_EXTENSION
    });
    let spawns: StructureSpawn[] = this.room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_SPAWN
    });
    const towers: StructureTower[] = this.room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_TOWER && structure.energy < 950
    });

    if (towers.find(tower => tower.energy < 50)) {
      // If any tower is below 50 energy, prioritize it over extensions and spawns
      extensions = [];
      spawns = [];
    }

    const structures = [...extensions, ...spawns, ...towers].filter(
      structure => structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    );
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
    const segments = haveUtilityCreeps ? Math.min(15, Math.floor(this.room.energyCapacityAvailable / 100)) : 1; // Carry-50; Move-50
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
