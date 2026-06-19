export default class CreepTask implements ICreepTask {
  activity: number;
  targetPlace: RoomPosition;
  targetPlaceSecond: RoomPosition | null;
  taskDone: boolean;
  targetId: string | null;

  constructor(
    activity: number,
    targetPlace: RoomPosition,
    targetPlaceSecond: RoomPosition | null = null,
    targetId: string | null = null
  ) {
    this.activity = activity;
    this.targetPlace = targetPlace;
    this.taskDone = false;
    this.targetId = targetId;
    this.targetPlaceSecond = targetPlaceSecond;
  }

  public static getSourceFromTarget(target: RoomPosition): Source | null {
    return new RoomPosition(target.x, target.y, target.roomName).findInRange(FIND_SOURCES, 0)[0];
  }

  public static getMineralFromTarget(target: RoomPosition): Mineral | null {
    return new RoomPosition(target.x, target.y, target.roomName).findInRange(FIND_MINERALS, 0)[0];
  }

  public static getConstructionSiteFromTarget(target: RoomPosition): ConstructionSite | null {
    return new RoomPosition(target.x, target.y, target.roomName).findInRange(FIND_MY_CONSTRUCTION_SITES, 0)[0];
  }

  public static getStructureFromTargetNoRoadNoRampart(target: RoomPosition): Structure | null {
    return new RoomPosition(target.x, target.y, target.roomName).findInRange(FIND_STRUCTURES, 0, {
      filter(structure) {
        return structure.structureType !== STRUCTURE_ROAD && structure.structureType !== STRUCTURE_RAMPART;
      }
    })[0];
  }

  public static getStructureFromTarget(target: RoomPosition): Structure | null {
    return new RoomPosition(target.x, target.y, target.roomName).findInRange(FIND_STRUCTURES, 0)[0];
  }

  public static getResourceFromTarget(target: RoomPosition): Resource | null {
    return new RoomPosition(target.x, target.y, target.roomName).findInRange(FIND_DROPPED_RESOURCES, 0)[0];
  }

  public static getRuinFromTarget(target: RoomPosition): Ruin | null {
    return new RoomPosition(target.x, target.y, target.roomName).findInRange(FIND_RUINS, 0)[0];
  }

  public static getTombstoneFromTarget(target: RoomPosition): Tombstone | null {
    return new RoomPosition(target.x, target.y, target.roomName).findInRange(FIND_TOMBSTONES, 0)[0];
  }

  public static getControllerFromTarget(target: RoomPosition): StructureController | null {
    const structure: Structure | null = new RoomPosition(
      target.x,
      target.y,
      target.roomName
    ).findInRange(FIND_STRUCTURES, 0, { filter: { structureType: STRUCTURE_CONTROLLER } })[0];
    if (structure instanceof StructureController) return structure;
    return null;
  }

  public static getRoomPositionFromTarget(target: RoomPosition): RoomPosition {
    return new RoomPosition(target.x, target.y, target.roomName);
  }

  public static getCreepFromTarget(target: RoomPosition): Creep | null {
    return new RoomPosition(target.x, target.y, target.roomName).findInRange(FIND_CREEPS, 0)[0];
  }
}

export enum Activity {
  Harvest = 0,
  Construct = 1,
  Deposit = 2,
  Move = 3,
  Collect = 4,
  Upgrade = 5,
  Pickup = 6,
  Claim = 7,
  MoveDifferentRoom = 8,
  Reserve = 9,
  HarvestAndDeposit = 10,
  Repair = 11,
  Attack = 12,
  RangedAttack = 13,
  Heal = 14,
  HarvestMineral = 15,
  DepositMineral = 16,
  CollectMineral = 17
}
