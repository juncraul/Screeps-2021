export default class SpawnTask  {
  spawnType: number;
  siteId: string;

  constructor(spawnType: number, siteId: string) {
    this.spawnType = spawnType;
    this.siteId = siteId;
  }
}

export enum SpawnType {
  Harvester = 0,
  Upgrader = 1,
  Carrier = 2
}