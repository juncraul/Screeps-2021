
export class Helper {

  public static getUserName(): string{
    //TODO: Make this not hard coded
    return "Raul"
    //return _.find(Game.structures)!.owner.username
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
