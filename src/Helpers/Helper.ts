export class Helper {
  public static getUserName(): string {
    // TODO: Make this not hard coded
    return "Raul";
    // return _.find(Game.structures)!.owner.username
  }

  public static isSamePosition(roomPosition1: RoomPosition, roomPosition2: RoomPosition) {
    return (
      roomPosition1.x === roomPosition2.x &&
      roomPosition1.y === roomPosition2.y &&
      roomPosition1.roomName === roomPosition2.roomName
    );
  }

  public static getCashedMemory(key: string, defaultValue: any): any {
    if (!Memory.Keys || typeof Memory.Keys !== "object") {
      Memory.Keys = {};
    }
    let obj = Memory.Keys[key];
    if (obj === undefined) {
      obj = defaultValue;
    }
    return obj;
  }

  public static setCashedMemory(key: string, value: any) {
    if (!Memory.Keys || typeof Memory.Keys !== "object") {
      Memory.Keys = {};
    }
    Memory.Keys[key] = value;
  }

  public static getFreeAdjacentPositions(pos: RoomPosition, room: Room) {
    const adjacentPositions: RoomPosition[] = [];
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        if (x === 0 && y === 0) continue;
        const adjacentPos = new RoomPosition(pos.x + x, pos.y + y, room.name);
        if (adjacentPos.x < 0 || adjacentPos.x > 49 || adjacentPos.y < 0 || adjacentPos.y > 49) continue;
        if (adjacentPos.lookFor(LOOK_TERRAIN)[0] === "wall") continue;
        if (adjacentPos.lookFor(LOOK_STRUCTURES).length > 0) continue;
        adjacentPositions.push(adjacentPos);
      }
    }
    return adjacentPositions;
  }
}
