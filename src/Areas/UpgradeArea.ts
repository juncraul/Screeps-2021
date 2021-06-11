import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";


export default class UpgradeArea extends BaseArea {
    controller: StructureController;
    maxWorkerCount: number;
    controllerLevel: number;
    containerNextToController: StructureContainer | null;
    linkNextToController: StructureLink | null;
    containerConstructionSiteNextToController: ConstructionSite | null;
  
    constructor(controller: StructureController) {
      super("UpgradeArea", controller.id, controller.pos, controller.room)
      this.controller = controller;
      this.maxWorkerCount = this.calculateMaxWorkerCount();
      this.controllerLevel = controller.level;
      this.containerNextToController = GetRoomObjects.getWithinRangeContainer(controller.pos, 2);
      this.linkNextToController = GetRoomObjects.getWithinRangeLink(controller.pos, 2);
      this.containerConstructionSiteNextToController = GetRoomObjects.getWithinRangeConstructionSite(controller.pos, 2, STRUCTURE_CONTAINER);
    }

    public handleSpawnTasks(): SpawnTask[]{
      let tasksForThisArea: SpawnTask[] = [];
      if (this.creeps.length < this.maxWorkerCount) {
        let task: SpawnTask | null = this.createCreepForThisArea();
        if (task) {
          tasksForThisArea.push(task);
        }
      }
      return tasksForThisArea;
    }

    public handleThisArea(){
      for (let i: number = this.creeps.length - 1; i >= 0; i--){
        //Find some resources
        if(this.creeps[i].store.energy == 0 && this.creeps[i].isFree()){
          if (this.containerNextToController && this.containerNextToController.store[RESOURCE_ENERGY] > 100){
            this.creeps[i].addTask(new CreepTask(Activity.Collect, this.containerNextToController.pos))
          } else if (this.linkNextToController && this.linkNextToController.store[RESOURCE_ENERGY] > 100){
            this.creeps[i].addTask(new CreepTask(Activity.Collect, this.linkNextToController.pos))
          }else{
            let structureWithEnergy = this.getGeneralStoreToCollectFrom()[0];
            if(structureWithEnergy){
                this.creeps[i].addTask(new CreepTask(Activity.Collect, structureWithEnergy.pos))
            }
          }
        }

        //Build the construction site(Container) or do the main job, which is upgrade the controller.
        if(this.creeps[i].isFull() && this.creeps[i].isFree()){
          if (this.containerConstructionSiteNextToController) {
            this.creeps[i].addTask(new CreepTask(Activity.Construct, this.containerConstructionSiteNextToController.pos))
          } else{
            this.creeps[i].addTask(new CreepTask(Activity.Upgrade, this.controller.pos))
          }
        }
      }
    }

    private calculateMaxWorkerCount(): number{
      //If is too early, one upgrader is enough.
      //For level 8 there is no point having more than one upgrader.
      switch(this.controllerLevel){
        case 1:
          return 1;
        case 2:
        case 3:
        case 4:
        case 5:
        case 6: 
        case 7:
          return 3;
        case 8:
          return 1;
        default:
          return 1;
      }
    }
  
    private createCreepForThisArea(): SpawnTask {
      return new SpawnTask(SpawnType.Upgrader, this.areaId, "Upgrader", [WORK, CARRY, MOVE], this);
    }
  }
  