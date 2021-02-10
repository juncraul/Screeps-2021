
export class Helper {
    public static getRoomSources(room: Room): Source[]{
        return room.find(FIND_SOURCES);
    }

    public static getRoomSpawns(room: Room): StructureSpawn[]{
        return room.find(FIND_MY_SPAWNS);
    }

    public static getCashedMemory(key: string, defaultValue : any): any {
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
