import BaseArea from "Areas/BaseArea";

export default class SpawnTask {
  spawnType: SpawnType;
  areaId: string;
  roleName: string;
  bodyPartConstant: BodyPartConstant[];
  area: BaseArea;
  namePrefix: string | null = null;
  spawnRoomName?: string;

  constructor(
    spawnType: SpawnType,
    areaId: string,
    roleName: string,
    bodyPartConstant: BodyPartConstant[],
    area: BaseArea,
    namePrefix: string | null = null,
    spawnRoomName?: string
  ) {
    this.spawnType = spawnType;
    this.areaId = areaId;
    this.roleName = roleName;
    this.bodyPartConstant = bodyPartConstant;
    this.area = area;
    this.namePrefix = namePrefix ?? this.getSpawnTypeText();
    this.spawnRoomName = spawnRoomName;
  }

  public getSpawnTypeText(): string {
    switch (this.spawnType) {
      case SpawnType.Harvester:
        return "Harvester";
      case SpawnType.Upgrader:
        return "Upgrader";
      case SpawnType.Carrier:
        return "Carrier";
      case SpawnType.Constructor:
        return "Constructor";
      case SpawnType.Claimer:
        return "Claimer";
      case SpawnType.Collector:
        return "Collector";
      case SpawnType.Repairer:
        return "Repairer";
      case SpawnType.Melee:
        return "Melee";
      case SpawnType.Ranged:
        return "Ranged";
      case SpawnType.Healer:
        return "Healer";
    }
  }

  public getBodyPartAsTextAggregated(): string {
    const partCounts: Record<BodyPartConstant, number> = {} as Record<BodyPartConstant, number>;
    for (const part of this.bodyPartConstant) {
      partCounts[part] = (partCounts[part] || 0) + 1;
    }
    return Object.entries(partCounts)
      .map(([part, count]) => `${count}x${part}`)
      .join(", ");
  }
}

export enum SpawnType {
  Harvester = 0,
  Upgrader = 1,
  Carrier = 2,
  Constructor = 3,
  Claimer = 4,
  Collector = 5,
  Repairer = 6,
  Melee = 7,
  Ranged = 8,
  Healer = 9
}
