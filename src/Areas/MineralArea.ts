import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import HarvestArea from "./HarvestArea";

export default class MineralArea extends HarvestArea {
  mineral: Mineral;

  constructor(mineral: Mineral, controller: StructureController) {
    super("MineralArea", mineral.id, mineral.pos, controller);
    this.mineral = mineral;
    this.maxWorkerCount = 1;
  }

  public handleSpawnTasks(): SpawnTask[] {
    if (this.controllerLevel < 6) return [];
    const extractor = this.mineral.pos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_EXTRACTOR);
    if (!extractor) return [];
    if (!this.containerNextToHarvestArea) return [];
    return super.handleSpawnTasks();
  }

  public handleThisArea() {
    if (this.controllerLevel < 6) return;
    super.handleThisArea();
  }

  protected handleSetup() {
    super.handleSetup();
    if (this.controllerLevel < 6) return;

    const extractor = this.mineral.pos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_EXTRACTOR);
    const extractorSite = this.mineral.pos
      .lookFor(LOOK_CONSTRUCTION_SITES)
      .find(s => s.structureType === STRUCTURE_EXTRACTOR);
    if (!extractor && !extractorSite) {
      this.room.createConstructionSite(this.mineral.pos, STRUCTURE_EXTRACTOR);
    }
  }

  protected handleCreeps(): void {
    if (!this.containerNextToHarvestArea) return;

    for (const creep of this.creeps) {
      if (!creep.isFree()) continue;
      if (this.containerNextToHarvestArea.store.getFreeCapacity() < 20) continue;
      creep.addTask(new CreepTask(Activity.HarvestMineral, this.mineral.pos, this.containerNextToHarvestArea.pos));
    }
  }

  protected createCreepForThisArea(): SpawnTask | null {
    const existing = this.room
      .find(FIND_MY_CREEPS)
      .filter(c => c.memory.role === "MineralHarvester" && c.memory.room === this.room.name);
    if (existing.length > 0) return null;

    const bodyPartConstants: BodyPartConstant[] = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE];
    return new SpawnTask(SpawnType.Harvester, this.areaId, "MineralHarvester", bodyPartConstants, this);
  }
}
