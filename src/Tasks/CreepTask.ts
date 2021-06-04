
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
    return (new RoomPosition(target.x, target.y, target.roomName)).findInRange(FIND_SOURCES, 0)[0];
  }

  public static getConstructionSiteFromTarget(target: RoomPosition): ConstructionSite | null {
    return (new RoomPosition(target.x, target.y, target.roomName)).findInRange(FIND_MY_CONSTRUCTION_SITES, 0)[0];
  }

  public static getStructureFromTarget(target: RoomPosition): Structure | null {
    return (new RoomPosition(target.x, target.y, target.roomName)).findInRange(FIND_STRUCTURES, 0)[0];
  }

  public static getRuinFromTarget(target: RoomPosition): Ruin | null {
    return (new RoomPosition(target.x, target.y, target.roomName)).findInRange(FIND_RUINS, 0)[0];
  }

  public static getControllerFromTarget(target: RoomPosition): StructureController | null {
    let structure: Structure | null = (new RoomPosition(target.x, target.y, target.roomName)).findInRange(FIND_STRUCTURES, 0, {filter: {structureType: STRUCTURE_CONTROLLER}})[0];
    if(structure instanceof StructureController)
      return structure;
    return null;
  }

  public static getRoomPositionFromTarget(target: RoomPosition): RoomPosition {
    return (new RoomPosition(target.x, target.y, target.roomName));
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