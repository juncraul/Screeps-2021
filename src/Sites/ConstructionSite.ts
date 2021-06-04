import { CreepBase } from "CreepBase";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseSite from "./BaseSite";


export default class ConstructionArea extends BaseSite {
    controller: StructureController;
    room: Room;
    creeps: CreepBase[];
    maxWorkerCount: number;
    controllerLevel: number;
    containersToCollectFrom: (StructureContainer | Ruin)[];
  
    constructor(controller: StructureController) {
      super("ConstructionArea", controller.room.name, controller.pos)
      this.controller = controller;
      this.creeps = this.getCreepsAssignedToThisSite();
      this.room = controller.room;
      this.controllerLevel = controller.level;
      this.containersToCollectFrom = this.getContainersToCollectFrom();
      this.maxWorkerCount = this.calculateMaxWorkerCount();
    }
  
    public handleConstructionArea(): SpawnTask[] {
      let tasksForThisSite: SpawnTask[] = [];
      if (this.creeps.length < this.maxWorkerCount) {
        let task: SpawnTask | null = this.createNewConstructionCreeps();
        if (task) {
          tasksForThisSite.push(task);
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
          if(!this.creeps[j].isEmpty() && this.creeps[j].isFree()){
            let constructionArea = this.getConstructionClosestByPoint(this.creeps[j].pos);
            if(constructionArea){
              this.creeps[j].addTask(new CreepTask(Activity.Construct, constructionArea.pos))
            }
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
      return sumOfConstructionPoint / 2000 >= 3 ? 3 : sumOfConstructionPoint / 2000 + 1;
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
      return new SpawnTask(SpawnType.Constructor, this.siteId);
    }
  }
  