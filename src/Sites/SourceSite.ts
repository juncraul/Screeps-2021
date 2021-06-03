import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import { CreepBase } from "../CreepBase";
import BaseSite from "./BaseSite";

export default class SourceSite extends BaseSite {
  source: Source;
  room: Room;
  creeps: CreepBase[];
  maxWorkerCount: number;
  controllerLevel: number;
  containerNextToSource: StructureContainer | null;
  containerConstructionSiteNextToSource: ConstructionSite | null;

  constructor(source: Source, controller: StructureController) {
    super("SourceSite", source.id, source.pos);
    this.source = source;
    this.room = source.room;
    this.maxWorkerCount = 1;
    this.creeps = this.getCreepsAssignedToThisSite();
    this.controllerLevel = controller.level;
    let potentialContainer = source.pos.findInRange(FIND_STRUCTURES, 2, { filter: { structureType: STRUCTURE_CONTAINER } })[0];
    let potentialContainerConstructionSite = source.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 1, { filter: { structureType: STRUCTURE_CONTAINER } })[0];
    this.containerNextToSource = (potentialContainer instanceof StructureContainer) ? potentialContainer : null;
    this.containerConstructionSiteNextToSource = (potentialContainerConstructionSite instanceof ConstructionSite) ? potentialContainerConstructionSite : null;
  }

  public handleSourceSite(): SpawnTask[] {
    let tasksForThisSourceSite: SpawnTask[] = [];
    if (this.creeps.length < this.maxWorkerCount) {
      let task: SpawnTask | null = this.createNewHarvesterCreeps();
      if (task) {
        tasksForThisSourceSite.push(task);
      }
    }
    if (this.containerConstructionSiteNextToSource) {
      for (let i: number = this.creeps.length - 1; i >= 0; i--){
        if(this.creeps[i].store.energy == 0 && this.creeps[i].isFree())
          this.creeps[i].addTask(new CreepTask(Activity.Harvest, this.source.pos))
        if(this.creeps[i].isFull() && this.creeps[i].isFree())
          this.creeps[i].addTask(new CreepTask(Activity.Construct, this.containerConstructionSiteNextToSource.pos))
      }
    }
    if (this.containerNextToSource){
      for (let i: number = this.creeps.length - 1; i >= 0; i--){
        if(this.creeps[i].store.energy == 0 && this.creeps[i].isFree()){
          if(i == 0)//Move only the first creep on top of container.
            this.creeps[i].addTask(new CreepTask(Activity.Move, this.containerNextToSource.pos))
          this.creeps[i].addTask(new CreepTask(Activity.Harvest, this.source.pos))
        }
        if(this.creeps[i].isFull() && this.creeps[i].isFree())
          this.creeps[i].addTask(new CreepTask(Activity.Deposit, this.containerNextToSource.pos))
      }
    }
    return tasksForThisSourceSite;
  }

  private createNewHarvesterCreeps(): SpawnTask | null {
    switch (this.controllerLevel) {
      case 1:
      case 2:
      case 3:
        return this.createHarvesterWithCarry();
    }
    return null
  }

  private createHarvesterWithCarry(): SpawnTask {
    return new SpawnTask(SpawnType.Harvester, this.source.id);
  }
}
