export default class SpawnTask  {
  spawnType: SpawnType;
  siteId: string;
  name: string;
  bodyPartConstant: BodyPartConstant[];

  constructor(spawnType: SpawnType, siteId: string, name: string, bodyPartConstant: BodyPartConstant[]) {
    this.spawnType = spawnType;
    this.siteId = siteId;
    this.name = name;
    this.bodyPartConstant = bodyPartConstant;
  }

  public getSpawnTypeText(): string {
    switch(this.spawnType){
      case SpawnType.Harvester:
      return "Harvester";
      case SpawnType.Upgrader:
      return "Upgrader";
      case SpawnType.Carrier:
      return "Carrier";
      case SpawnType.Constructor:
      return "Constructor";
    }
  }
}

export enum SpawnType {
  Harvester = 0,
  Upgrader = 1,
  Carrier = 2,
  Constructor = 3
}