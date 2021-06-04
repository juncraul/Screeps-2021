import { CreepBase } from "CreepBase";
import { Helper } from "Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseSite from "./BaseSite";


export default class CarrySite extends BaseSite {
    controller: StructureController;
    room: Room;
    creeps: CreepBase[];
    maxWorkerCount: number;
    controllerLevel: number;
    containerNextToController: StructureContainer | null;
    spawns: StructureSpawn[];
    containersToCollectFrom: (StructureContainer | Ruin)[];
  
    constructor(controller: StructureController) {
      super("CarrySite", controller.room.name, controller.pos)
      this.controller = controller;
      this.maxWorkerCount = 1;
      this.creeps = this.getCreepsAssignedToThisSite();
      this.room = controller.room;
      this.controllerLevel = controller.level;
      let potentialContainer = controller.pos.findInRange(FIND_STRUCTURES, 3, { filter: { structureType: STRUCTURE_CONTAINER } })[0];
      this.containerNextToController = (potentialContainer instanceof StructureContainer) ? potentialContainer : null;
      this.spawns = Helper.getRoomSpawns(controller.room, true);
      this.containersToCollectFrom = this.getContainersToCollectFrom();
    }
  
    public handleCarrySite(): SpawnTask[] {
      let tasksForThisUpgradeSite: SpawnTask[] = [];
      if (this.creeps.length < this.maxWorkerCount) {
        let task: SpawnTask | null = this.createNewCarrierCreeps();
        if (task) {
          tasksForThisUpgradeSite.push(task);
        }
      }
      for(let i: number = 0; i < this.creeps.length; i ++){
        if(this.creeps[i].isEmpty() && this.creeps[i].isFree()){
          for( let j: number = 0; j < this.containersToCollectFrom.length; j ++){
            if(this.containersToCollectFrom[j].store.energy < 200)
              continue;
            this.creeps[i].addTask(new CreepTask(Activity.Collect, this.containersToCollectFrom[j].pos))
          }
        }
        if(this.creeps[i].isFull() && this.creeps[i].isFree()){
          this.spawns.forEach(spawn =>{
            this.creeps[i].addTask(new CreepTask(Activity.Deposit, spawn.pos))
          })
        }
        if(this.creeps[i].isFull() && this.creeps[i].isFree()){
          if(this.containerNextToController){
            this.creeps[i].addTask(new CreepTask(Activity.Deposit, this.containerNextToController.pos))
          }
        }
      }
      return tasksForThisUpgradeSite;
    }
  
    private createNewCarrierCreeps(): SpawnTask | null {
      switch (this.controllerLevel) {
        case 1:
        case 2:
        case 3:
          return this.createCarrier();
      }
      return null
    }
  
    private createCarrier(): SpawnTask {
      return new SpawnTask(SpawnType.Carrier, this.siteId);
    }
  }
  