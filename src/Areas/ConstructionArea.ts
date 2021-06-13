import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";


export default class ConstructionArea extends BaseArea {
    controller: StructureController;
    maxWorkerCount: number;
    controllerLevel: number;
    containersToCollectFrom: (StructureContainer | Ruin)[];
    droppedResourcesToCollectFrom: Resource[];
    storage: StructureStorage | null;
  
    constructor(controller: StructureController) {
      super("ConstructionArea", controller.room.name, controller.pos, controller.room)
      this.controller = controller;
      this.controllerLevel = controller.level;
      this.containersToCollectFrom = this.getGeneralStoreToCollectFrom();
      this.maxWorkerCount = this.calculateMaxWorkerCount();
      this.droppedResourcesToCollectFrom = this.getDroppedResourcesToCollectFrom(RESOURCE_ENERGY);
      this.storage = GetRoomObjects.getRoomStorage(controller.room);
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
  
    public handleThisArea() {
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
          if(!foundSomewhereToCollectFrom && this.storage && this.storage.store.energy > 200){
            this.creeps[i].addTask(new CreepTask(Activity.Collect, this.storage.pos))//TODO:Add Energy type in here.
          }
        }
        if(!this.creeps[i].isEmpty() && this.creeps[i].isFree()){
          let constructionArea = this.getConstructionClosestByPoint(this.creeps[i].pos);
          if(constructionArea){
            this.creeps[i].addTask(new CreepTask(Activity.Construct, constructionArea.pos))
          }
        }
      }
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
  
    private createCreepForThisArea(): SpawnTask {
      return new SpawnTask(SpawnType.Constructor, this.areaId, "Constructor", [WORK, CARRY, MOVE], this);
    }
  }
  