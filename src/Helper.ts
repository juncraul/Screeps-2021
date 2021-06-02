
export class Helper {
  public static getRoomController(room: Room): StructureController | null {
    let structure = room.find(FIND_STRUCTURES, {filter: {structureType: STRUCTURE_CONTROLLER}})[0];
    if(structure instanceof StructureController)
      return structure;
    return null
  }

  public static getRoomSources(room: Room): Source[] {
    return room.find(FIND_SOURCES);
  }

  public static getRoomConstructions(room: Room): ConstructionSite[] {
    return room.find(FIND_MY_CONSTRUCTION_SITES);
  }

  public static getRoomSpawns(room: Room): StructureSpawn[] {
    return room.find(FIND_MY_SPAWNS);
  }

  public static getRoomCreepsMine(room: Room): Creep[] {
    return room.find(FIND_MY_CREEPS);
  }

  public static getRoomCreepsMineNoTask(room: Room): Creep[] {
    return room.find(FIND_MY_CREEPS).filter(creep => creep.memory.task == null || creep.memory.task.taskDone);
  }

  public static getAllMyCreeps(includingSpawning: boolean = false): Creep[] {
    return _.filter(Game.creeps, (creep) => creep.spawning == includingSpawning);
  }

  public static getCashedMemory(key: string, defaultValue: any): any {
    let obj = Memory.Keys[key];
    if (obj == undefined) {
      obj = defaultValue;
    }
    return obj;
  }

  public static setCashedMemory(key: string, value: any) {
    Memory.Keys[key] = value;
  }
}
