import { CreepBase } from "CreepBase";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseSite from "./BaseSite";


export default class UpgradeSite extends BaseSite {
    controller: StructureController;
    room: Room;
    maxWorkerCount: number;
    controllerLevel: number;
    containerNextToUpgrade: StructureContainer | null;
    containerConstructionSiteNextToUpgrade: ConstructionSite | null;
  
    constructor(controller: StructureController) {
      super("Controller", controller.id, controller.pos)
      this.controller = controller;
      this.maxWorkerCount = this.calculateMaxWorkerCount();
      this.room = controller.room;
      this.controllerLevel = controller.level;
      let potentialContainer = controller.pos.findInRange(FIND_STRUCTURES, 3, { filter: { structureType: STRUCTURE_CONTAINER } })[0];
      let potentialContainerConstructionSite = controller.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 2, { filter: { structureType: STRUCTURE_CONTAINER } })[0];
      this.containerNextToUpgrade = (potentialContainer instanceof StructureContainer) ? potentialContainer : null;
      this.containerConstructionSiteNextToUpgrade = (potentialContainerConstructionSite instanceof ConstructionSite) ? potentialContainerConstructionSite : null;
    }
  
    public handleUpgradeSite(): SpawnTask[] {
      let tasksForThisUpgradeSite: SpawnTask[] = [];
      if (this.creeps.length < this.maxWorkerCount) {
        let task: SpawnTask | null = this.createNewUpgraderCreeps();
        if (task) {
          tasksForThisUpgradeSite.push(task);
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
      return tasksForThisUpgradeSite;
    }

    private getStructureWithMoreThan100Energy(): AnyStructure | null {
      return this.sitePos.findClosestByRange(FIND_STRUCTURES, {filter: (str) => {return str.structureType == STRUCTURE_CONTAINER && str.store[RESOURCE_ENERGY] > 100}})
    }

    private calculateMaxWorkerCount(): number{
      if(this.containerNextToUpgrade){
        return 1;
      }else{
        return 3;
      }
    }
  
    private createNewUpgraderCreeps(): SpawnTask | null {
      switch (this.controllerLevel) {
        case 1:
        case 2:
        case 3:
          return this.createHarvesterWithCarry();
      }
      return null
    }
  
    private createHarvesterWithCarry(): SpawnTask {
      return new SpawnTask(SpawnType.Upgrader, this.siteId, "Upgrader", [WORK, CARRY, MOVE]);
    }
  }
  