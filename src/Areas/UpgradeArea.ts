import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";


export default class UpgradeArea extends BaseArea {
    controller: StructureController;
    room: Room;
    maxWorkerCount: number;
    controllerLevel: number;
    containerNextToUpgrade: StructureContainer | null;
    containerConstructionSiteNextToUpgrade: ConstructionSite | null;
  
    constructor(controller: StructureController) {
      super("UpgradeArea", controller.id, controller.pos)
      this.controller = controller;
      this.maxWorkerCount = this.calculateMaxWorkerCount();
      this.room = controller.room;
      this.controllerLevel = controller.level;
      this.containerNextToUpgrade = GetRoomObjects.getWithinRangeContainer(controller.pos, 2);
      this.containerConstructionSiteNextToUpgrade = GetRoomObjects.getWithinRangeConstructionSite(controller.pos, 2, STRUCTURE_CONTAINER);
    }
  
    public handleUpgradeArea(): SpawnTask[] {
      let tasksForThisUpgradeArea: SpawnTask[] = [];
      if (this.creeps.length < this.maxWorkerCount) {
        let task: SpawnTask | null = this.createCreepForThisArea();
        if (task) {
          tasksForThisUpgradeArea.push(task);
        }
      }
      if (this.containerConstructionSiteNextToUpgrade) {
        for (let i: number = this.creeps.length - 1; i >= 0; i--){
          if(this.creeps[i].store.energy == 0 && this.creeps[i].isFree()){
            let structureWithEnergy = this.getStructureWithMoreThan100Energy();
            if(structureWithEnergy){
                this.creeps[i].addTask(new CreepTask(Activity.Collect, structureWithEnergy.pos))
            }
          }
          if(this.creeps[i].isFull() && this.creeps[i].isFree())
            this.creeps[i].addTask(new CreepTask(Activity.Construct, this.containerConstructionSiteNextToUpgrade.pos))
        }
      }
      if (this.containerNextToUpgrade){
        for (let i: number = this.creeps.length - 1; i >= 0; i--){
          if(this.creeps[i].store.energy == 0 && this.creeps[i].isFree()){
            let structureWithEnergy = this.getStructureWithMoreThan100Energy();
            if(structureWithEnergy){
                this.creeps[i].addTask(new CreepTask(Activity.Collect, structureWithEnergy.pos))
            }
          }
          if(this.creeps[i].isFull() && this.creeps[i].isFree())
            this.creeps[i].addTask(new CreepTask(Activity.Upgrade, this.controller.pos))
        }
      }
      return tasksForThisUpgradeArea;
    }

    private getStructureWithMoreThan100Energy(): AnyStructure | null {
      return this.areaPos.findClosestByRange(FIND_STRUCTURES, {filter: (str) => {return str.structureType == STRUCTURE_CONTAINER && str.store[RESOURCE_ENERGY] > 100}})
    }

    private calculateMaxWorkerCount(): number{
      if(this.containerNextToUpgrade){
        return 1;
      }else{
        return 3;
      }
    }
  
    private createCreepForThisArea(): SpawnTask {
      return new SpawnTask(SpawnType.Upgrader, this.areaId, "Upgrader", [WORK, CARRY, MOVE]);
    }
  }
  