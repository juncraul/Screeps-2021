import MineralArea from "Areas/BaseRoom/MineralArea";
import { GetRoomObjects } from "Helpers/GetRoomObjects";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";

export default class Season11ThoriumArea extends MineralArea {
  constructor(thorium: Mineral, controller: StructureController) {
    super(thorium, controller);
    this.containerNextToHarvestArea = GetRoomObjects.getWithinRangeContainer(thorium.pos, 1);
  }

  public handleThisArea(): void {
    this.handleSetup();
    super.handleThisArea();
  }

  protected createCreepForThisArea(): SpawnTask | null {
    const existing = this.room
      .find(FIND_MY_CREEPS)
      .filter(c => c.memory.role === "Season11ThoriumHarvester" && c.memory.room === this.room.name);
    if (existing.length > 0) return null;

    const bodyPartConstants: BodyPartConstant[] = [WORK, WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE];
    return new SpawnTask(CreepType.Season11ThoriumHarvester, this.areaId, bodyPartConstants, this);
  }
}
