import { Helper } from "Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import { CreepBase } from "../CreepBase";
import BaseSite from "./BaseSite";

export default class SourceSite extends BaseSite {
  source: Source;
  room: Room;
  maxWorkerCount: number;
  controllerLevel: number;
  containerNextToSource: StructureContainer | null;
  containerConstructionSiteNextToSource: ConstructionSite | null;

  constructor(source: Source, controller: StructureController) {
    super("SourceSite", source.id, source.pos);
    this.source = source;
    this.room = source.room;
    this.maxWorkerCount = 1;
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
      for (let i: number = 0; i < this.creeps.length; i++){
        if(this.creeps[i].store.energy == 0 && this.creeps[i].isFree())
          this.creeps[i].addTask(new CreepTask(Activity.Harvest, this.source.pos))
        if(this.creeps[i].isFull() && this.creeps[i].isFree())
          this.creeps[i].addTask(new CreepTask(Activity.Construct, this.containerConstructionSiteNextToSource.pos))
      }
    }
    if (this.containerNextToSource){
      for (let i: number = 0; i < this.creeps.length; i++){
        if(this.creeps[i].store.energy == 0 && this.creeps[i].isFree()){
          if(i == 0){//Move only the first creep on top of container.
            if(!Helper.isSamePosition(this.containerNextToSource.pos, this.creeps[i].pos)){
              this.creeps[i].addTask(new CreepTask(Activity.Move, this.containerNextToSource.pos))
            }else{
              this.creeps[i].addTask(new CreepTask(Activity.Harvest, this.source.pos))
            }
          }else{
            this.creeps[i].addTask(new CreepTask(Activity.Harvest, this.source.pos))
          }
        }
        if(this.creeps[i].isFull() && this.creeps[i].isFree())
          this.creeps[i].addTask(new CreepTask(Activity.Deposit, this.containerNextToSource.pos))
      }
    }
    return tasksForThisSourceSite;
  }

  private createNewHarvesterCreeps(): SpawnTask | null {
    let bodyPartConstants: BodyPartConstant[] =[]
    if(this.containerNextToSource){
      let segments = Math.floor(this.room.energyCapacityAvailable / 150);//Work-100; Move-50
      if(segments < 2){
        console.log("Something wrong with room capacity")
      } else if(segments == 2){//300 energy
        bodyPartConstants = [WORK, WORK, MOVE, MOVE]
      } else if(segments == 3){//450 energy
        bodyPartConstants = [WORK, WORK, WORK, MOVE, MOVE, MOVE]
      } else if(segments == 4){//600 energy
        bodyPartConstants = [WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE]
      } else if(segments >= 5){//800 energy - This is the ideal creep with 10 energy collected per tick, enough for source refresh.
        bodyPartConstants = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE]
      }
    }else{
      let segments = Math.floor(this.room.energyCapacityAvailable / 200);//Work-100; Move-50; Carry-50
      if(segments < 1){
        console.log("Something wrong with room capacity")
      } else if(segments == 1){//200 energy
        bodyPartConstants = [WORK, MOVE, CARRY]
      } else if(segments == 2){//400 energy
        bodyPartConstants = [WORK, WORK, MOVE, MOVE, CARRY, CARRY]
      } else if(segments == 3){//600 energy
        bodyPartConstants = [WORK, WORK, WORK, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY]
      } else if(segments >= 4){//800 energy
        bodyPartConstants = [WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY]
      }
    }
    return new SpawnTask(SpawnType.Harvester, this.source.id, "Harvester", bodyPartConstants);
  }
}
