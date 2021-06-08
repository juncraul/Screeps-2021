import { CreepBase } from "CreepBase";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseSite from "./BaseSite";


export default class ConstructionArea extends BaseSite {
    controller: StructureController;
    room: Room;
    maxWorkerCount: number;
    controllerLevel: number;
    containersToCollectFrom: (StructureContainer | Ruin)[];
    droppedResourcesToCollectFrom: Resource[];
  
    constructor(controller: StructureController) {
      super("ConstructionArea", controller.room.name, controller.pos)
      this.controller = controller;
      this.room = controller.room;
      this.controllerLevel = controller.level;
      this.containersToCollectFrom = this.getContainersToCollectFrom();
      this.maxWorkerCount = this.calculateMaxWorkerCount();
      this.droppedResourcesToCollectFrom = this.getDroppedResourcesToCollectFrom(RESOURCE_ENERGY);
    }
  
    public handleConstructionArea(): SpawnTask[] {
      let tasksForThisSite: SpawnTask[] = [];
      if (this.creeps.length < this.maxWorkerCount) {
        let task: SpawnTask | null = this.createNewConstructionCreeps();
        if (task) {
          tasksForThisSite.push(task);
        }
      }
      for(let i: number = 0; i < this.creeps.length; i ++){
        if(this.creeps[i].isEmpty() && this.creeps[i].isFree()){
          let foundSomewhereToCollectFrom: boolean = false;
          for( let j: number = 0; j < this.containersToCollectFrom.length; j ++){
            if(this.containersToCollectFrom[j].store.energy < 200)
              continue;
            this.creeps[i].addTask(new CreepTask(Activity.Collect, this.containersToCollectFrom[j].pos))
            foundSomewhereToCollectFrom = true;
            continue;//This is so that not all creeps get sent to same container.  
          }
          for( let j: number = 0; j < this.droppedResourcesToCollectFrom.length && !foundSomewhereToCollectFrom; j ++){
            if(this.droppedResourcesToCollectFrom[j].amount < 200)
              continue;
            this.creeps[i].addTask(new CreepTask(Activity.Pickup, this.droppedResourcesToCollectFrom[j].pos))
            foundSomewhereToCollectFrom = true;
          }
        }
        if(!this.creeps[i].isEmpty() && this.creeps[i].isFree()){
          let constructionArea = this.getConstructionClosestByPoint(this.creeps[i].pos);
          if(constructionArea){
            this.creeps[i].addTask(new CreepTask(Activity.Construct, constructionArea.pos))
          }
        }
      }
      
      return tasksForThisSite;
    }

    private getConstructionClosestByPoint(position: RoomPosition) {
      return position.findClosestByRange(FIND_MY_CONSTRUCTION_SITES);
    }

    private getConstructionsInRoom(room: Room) {
      return room.find(FIND_MY_CONSTRUCTION_SITES);
    }

    private calculateMaxWorkerCount(): number{
      if(this.containersToCollectFrom.length == 0)
        return 0;
      let constructions = this.getConstructionsInRoom(this.room);
      let sumOfConstructionPoint = constructions.reduce(function(accumulator, item){return accumulator + item.progressTotal - item.progress}, 0)
      return Math.floor(sumOfConstructionPoint / 5000 >= 3 ? 3 : Math.ceil(sumOfConstructionPoint / 5000));
    }
  
    private createNewConstructionCreeps(): SpawnTask | null {
      switch (this.controllerLevel) {
        case 1:
        case 2:
        case 3:
          return this.createHarvesterWithCarry();
      }
      return null
    }
  
    private createHarvesterWithCarry(): SpawnTask {
      return new SpawnTask(SpawnType.Constructor, this.siteId, "Constructor", [WORK, CARRY, MOVE]);
    }
  }
  