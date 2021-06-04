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
      for( let i: number = this.containersToCollectFrom.length - 1; i >= 0; i --){
        if(this.containersToCollectFrom[i].store.energy < 200)
          continue;
        for(let j: number = this.creeps.length - 1; j >= 0; j --){
          if(this.creeps[j].isEmpty() && this.creeps[j].isFree()){
            this.creeps[j].addTask(new CreepTask(Activity.Collect, this.containersToCollectFrom[i].pos))
            continue;//This is so that not all creeps get sent to same container.
          }
          if(this.creeps[j].isFull() && this.creeps[j].isFree()){
            this.spawns.forEach(spawn =>{
              this.creeps[j].addTask(new CreepTask(Activity.Deposit, spawn.pos))
            })
          }
          if(this.creeps[j].isFull() && this.creeps[j].isFree()){
            if(this.containerNextToController){
              this.creeps[j].addTask(new CreepTask(Activity.Deposit, this.containerNextToController.pos))
            }
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
  