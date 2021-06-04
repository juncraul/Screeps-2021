
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

  public static getRoomConstructions(room: Room, mine?: boolean): ConstructionSite[] {
    if(mine){
      return room.find(FIND_MY_CONSTRUCTION_SITES);
    }
    return room.find(FIND_CONSTRUCTION_SITES);
  }

  public static getRoomSpawns(room: Room, mine?: boolean): StructureSpawn[] {
    if(mine){
      return room.find(FIND_MY_SPAWNS);
    }
    return room.find(FIND_HOSTILE_SPAWNS);
  }

  public static getRoomExtensions(room: Room, mine?: boolean): StructureExtension[] {
    let structures: Structure[];
    let extensions: StructureExtension[] = [];
    if(mine){
      structures = room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_EXTENSION}});
    }else{
      structures = room.find(FIND_STRUCTURES, {filter: {structureType: STRUCTURE_EXTENSION}});
    }
    structures.forEach(structure => {
      if(structure instanceof StructureExtension){
        extensions.push(structure)
      }
    })
    return extensions;
  }

  public static getRoomCreeps(room: Room, mine?: boolean): Creep[] {
    if(mine){
      return room.find(FIND_MY_CREEPS);
    }
    return room.find(FIND_CREEPS);
  }

  public static getRoomCreepsMineNoTask(room: Room): Creep[] {
    return room.find(FIND_MY_CREEPS).filter(creep => creep.memory.task == null || creep.memory.task.taskDone);
  }

  public static getAllMyCreeps(includingSpawning: boolean = false): Creep[] {
    return _.filter(Game.creeps, (creep) => creep.spawning == includingSpawning);
  }

  public static isSamePosition(roomPosition1: RoomPosition, roomPosition2: RoomPosition){
    return roomPosition1.x == roomPosition2.x && roomPosition1.y == roomPosition2.y && roomPosition1.roomName == roomPosition2.roomName;
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
