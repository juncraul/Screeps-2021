import BaseArea from "Areas/BaseArea";
import { CreepType } from "CreepType";

export { CreepType };

export default class SpawnTask {
  creepType: CreepType;
  areaId: string;
  bodyPartConstant: BodyPartConstant[];
  area: BaseArea;
  namePrefix: string;
  spawnRoomName?: string;

  constructor(
    creepType: CreepType,
    areaId: string,
    bodyPartConstant: BodyPartConstant[],
    area: BaseArea,
    namePrefix: string | null = null,
    spawnRoomName?: string
  ) {
    this.creepType = creepType;
    this.areaId = areaId;
    this.bodyPartConstant = bodyPartConstant;
    this.area = area;
    this.namePrefix = namePrefix ?? this.getCreepTypeText();
    this.spawnRoomName = spawnRoomName;
  }

  public getCreepTypeText(): string {
    switch (this.creepType) {
      case CreepType.Harvester:
        return "Harvester";
      case CreepType.Upgrader:
        return "Upgrader";
      case CreepType.Carrier:
        return "Carrier";
      case CreepType.Constructor:
        return "Constructor";
      case CreepType.Claimer:
        return "Claimer";
      case CreepType.Collector:
        return "Collector";
      case CreepType.Repairer:
        return "Repairer";
      case CreepType.Melee:
        return "Melee";
      case CreepType.Ranged:
        return "Ranged";
      case CreepType.Healer:
        return "Healer";
      case CreepType.Utility:
        return "Utility";
      case CreepType.MineralHarvester:
        return "MineralHarvester";
      case CreepType.MineralCarrier:
        return "MineralCarrier";
      case CreepType.Looter:
        return "Looter";
      case CreepType.Defender:
        return "Defender";
      case CreepType.DefenseHealer:
        return "DefenseHealer";
      case CreepType.DefenseRanger:
        return "DefenseRanger";
      case CreepType.StationaryFiller:
        return "StationaryFiller";
      case CreepType.Dismantler:
        return "Dismantler";
      case CreepType.Clerk:
        return "Clerk";
      case CreepType.Scout:
        return "Scout";
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
