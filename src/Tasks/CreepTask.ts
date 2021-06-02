
export default class CreepTask implements ICreepTask {
  activity: number;
  targetPlace: RoomPosition;
  taskDone: boolean;

  constructor(activity: number, targetPlace: RoomPosition) {
    this.activity = activity;
    this.targetPlace = targetPlace;
    this.taskDone = false;
  }

  public static getSourceFromTarget(target: RoomPosition): Source | null {
    return (new RoomPosition(target.x, target.y, target.roomName)).findClosestByRange(FIND_SOURCES);
  }

  public static getConstructionSiteFromTarget(target: RoomPosition): ConstructionSite | null {
    return (new RoomPosition(target.x, target.y, target.roomName)).findClosestByRange(FIND_MY_CONSTRUCTION_SITES);
  }

  public static getStructureFromTarget(target: RoomPosition): Structure | null {
    return (new RoomPosition(target.x, target.y, target.roomName)).findClosestByRange(FIND_STRUCTURES);
  }

  public static getControllerFromTarget(target: RoomPosition): StructureController | null {
    let structure: Structure | null = (new RoomPosition(target.x, target.y, target.roomName)).findClosestByRange(FIND_STRUCTURES, {filter: {structureType: STRUCTURE_CONTROLLER}});
    if(structure instanceof StructureController)
      return structure;
    return null;
  }
}

export enum Activity {
    Harvest = 0,
    Construct = 1,
    Deposit = 2,
    Move = 3,
    Collect = 4,
    Upgrade = 5
}