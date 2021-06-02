import { CreepBase } from "CreepBase";
import CreepTask, { Activity } from "Tasks/CreepTask";
import { Helper } from "Helper";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";


export default class UpgradeSite {
    controller: StructureController;
    room: Room;
    creeps: CreepBase[];
    maxWorkerCount: number;
    controllerLevel: number;
    containerNextToUpgrade: StructureContainer | null;
    containerConstructionSiteNextToUpgrade: ConstructionSite | null;
    memoryType: string;
    siteId: string;
    sitePos: RoomPosition;
  
    constructor(controller: StructureController) {
      this.controller = controller;
      this.maxWorkerCount = 1;
      this.creeps = this.getCreepsAssignedToThisSite();
      this.room = controller.room;
      this.controllerLevel = controller.level;
      let potentialContainer = controller.pos.findInRange(FIND_MY_STRUCTURES, 1, { filter: { structureType: STRUCTURE_CONTAINER } })[0];
      let potentialContainerConstructionSite = controller.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 2, { filter: { structureType: STRUCTURE_CONTAINER } })[0];
      this.containerNextToUpgrade = (potentialContainer instanceof StructureContainer) ? potentialContainer : null;
      this.containerConstructionSiteNextToUpgrade = (potentialContainerConstructionSite instanceof ConstructionSite) ? potentialContainerConstructionSite : null;
      this.memoryType = "Controller";
      this.siteId = controller.id;
      this.sitePos = controller.pos;
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
            let structureWithEnergy = this.sitePos.findClosestByRange(FIND_STRUCTURES, {filter: (str) => {str.structureType == STRUCTURE_CONTAINER && str.store[RESOURCE_ENERGY] > 100}})
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
            let structureWithEnergy = this.sitePos.findClosestByRange(FIND_STRUCTURES, {filter: (str) => {str.structureType == STRUCTURE_CONTAINER && str.store[RESOURCE_ENERGY] > 100}})
            if(structureWithEnergy){
                this.creeps[i].addTask(new CreepTask(Activity.Collect, structureWithEnergy.pos))
            }
          }
          if(this.creeps[i].isFull() && this.creeps[i].isFree())
            this.creeps[i].addTask(new CreepTask(Activity.Upgrade, this.containerNextToUpgrade.pos))
        }
      }
      return tasksForThisUpgradeSite;
    }
  
    private getCreepsAssignedToThisSite(): CreepBase[] {
      let creepsIds: string[] = Helper.getCashedMemory(`${this.memoryType}-${this.siteId}`, []);
      let creeps: CreepBase[] = [];
      for (let i: number = creepsIds.length - 1; i >= 0; i--) {
        let creep: Creep | null = Game.getObjectById(creepsIds[i]);
        if (creep && creep.hits > 0) {
          creeps.push(new CreepBase(creep));
        } else {
          //Clean up any dead creeps.
          creepsIds.splice(i, 1);
        }
      }
      Helper.setCashedMemory(`${this.memoryType}-${this.siteId}`, creepsIds);
      return creeps;
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
      return new SpawnTask(SpawnType.Upgrader, this.siteId);
    }
  }
  