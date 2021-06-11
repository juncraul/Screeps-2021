
import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";


export default class CarryArea extends BaseArea {
    controller: StructureController;
    room: Room;
    maxWorkerCount: number;
    controllerLevel: number;
    containerNextToController: StructureContainer | null;
    spawns: StructureSpawn[];
    extensions: StructureExtension[];
    depositToGeneralStore: (StructureContainer)[];
    depositToLimitedStore: (StructureSpawn | StructureExtension | StructureTower | StructureLink)[];
    containersToCollectFrom: (StructureContainer | Ruin)[];
    droppedResourcesToCollectFrom: Resource[];
  
    constructor(controller: StructureController) {
      super("CarryArea", controller.room.name, controller.pos)
      this.controller = controller;
      this.maxWorkerCount = 1;
      this.room = controller.room;
      this.controllerLevel = controller.level;
      this.containerNextToController = GetRoomObjects.getWithinRangeContainer(controller.pos, 3);
      this.spawns = GetRoomObjects.getRoomSpawns(controller.room, true);
      this.extensions = GetRoomObjects.getRoomExtensions(controller.room, true);
      this.depositToGeneralStore = this.getGeneralDeposits();
      this.depositToLimitedStore = this.getLimitedDeposits();
      this.containersToCollectFrom = this.getContainersToCollectFrom();
      this.droppedResourcesToCollectFrom = this.getDroppedResourcesToCollectFrom(RESOURCE_ENERGY);
    }
  
    public handleCarryArea(): SpawnTask[] {
      let tasksForThisUpgradeArea: SpawnTask[] = [];
      if (this.creeps.length < this.maxWorkerCount + this.getNumberOfDyingCreeps()) {
        let task: SpawnTask | null = this.createCreepForThisArea();
        if (task) {
          tasksForThisUpgradeArea.push(task);
        }
      }
      for(let i: number = 0; i < this.creeps.length; i ++){
        if(this.creeps[i].isEmpty() && this.creeps[i].isFree()){
          let foundSomewhereToCollectFrom = false;
          for( let j: number = 0; j < this.containersToCollectFrom.length; j ++){
            if(this.containersToCollectFrom[j].store.energy < 200)
              continue;
            this.creeps[i].addTask(new CreepTask(Activity.Collect, this.containersToCollectFrom[j].pos))
            foundSomewhereToCollectFrom = true;
          }
          for( let j: number = 0; j < this.droppedResourcesToCollectFrom.length && !foundSomewhereToCollectFrom; j ++){
            if(this.droppedResourcesToCollectFrom[j].amount < 200)
              continue;
            this.creeps[i].addTask(new CreepTask(Activity.Pickup, this.droppedResourcesToCollectFrom[j].pos))
            foundSomewhereToCollectFrom = true;
          }
        }
        let foundSomewhereToDeposit = false;
        let depositToLimitedStoreSorted = this.depositToLimitedStore.sort((a, b) => a.pos.getRangeTo(this.creeps[i].pos.x, this.creeps[i].pos.y) - b.pos.getRangeTo(this.creeps[i].pos.x, this.creeps[i].pos.y))
        if(!this.creeps[i].isEmpty() && this.creeps[i].isFree()){
          for(let j: number = 0; j < depositToLimitedStoreSorted.length; j ++){
            if(depositToLimitedStoreSorted[j].store.getFreeCapacity(RESOURCE_ENERGY) == 0)
              continue;
            this.creeps[i].addTask(new CreepTask(Activity.Deposit, depositToLimitedStoreSorted[j].pos))
            foundSomewhereToDeposit = true;
            break;
          }
        }
        if(!this.creeps[i].isEmpty() && this.creeps[i].isFree() && !foundSomewhereToDeposit){
          for(let j: number = 0; j < this.depositToGeneralStore.length; j ++){
            if(this.depositToGeneralStore[j].store.getFreeCapacity(RESOURCE_ENERGY) == 0)
              continue;
            this.creeps[i].addTask(new CreepTask(Activity.Deposit, this.depositToGeneralStore[j].pos))
            break;
          }
        }
      }
      return tasksForThisUpgradeArea;
    }

    private getGeneralDeposits():(StructureContainer)[]{
      let structures: (StructureContainer)[] = [];
      if(this.containerNextToController)
        structures.push(this.containerNextToController);
      return structures;
    }

    private getLimitedDeposits():(StructureSpawn | StructureExtension | StructureTower | StructureLink)[]{
      let structures: (StructureSpawn | StructureExtension | StructureTower | StructureLink)[] = [];
      this.extensions.forEach(extension =>{
        if(extension.store.getFreeCapacity(RESOURCE_ENERGY) != 0)
          structures.push(extension);
      })
      this.spawns.forEach(spawn =>{
        if(spawn.store.getFreeCapacity(RESOURCE_ENERGY) != 0)
          structures.push(spawn);
      })
      GetRoomObjects.getRoomTowers(this.room).forEach(tower => {
        if(tower.store.getFreeCapacity(RESOURCE_ENERGY) > 200)
          structures.push(tower);
      })
      GetRoomObjects.getRoomSources(this.room).forEach(source =>{
        let potentialLink = GetRoomObjects.getWithinRangeLink(source.pos, 3);
        if(potentialLink && potentialLink.store.getFreeCapacity(RESOURCE_ENERGY) != 0)
          structures.push(potentialLink)
      })
      return structures;
    }
  
    private createCreepForThisArea(): SpawnTask | null {
      let bodyPartConstants: BodyPartConstant[] =[]
      let segments = Math.floor(this.room.energyCapacityAvailable / 100);//Carry-50; Move-50
      if(this.creeps.length == 0){//Note: In this situation, there is no way to fill extensions
        //Use energyAvailable to setup the segments with 3 as a cap. A.k.a. wait till Spawn has 300 energy.
        segments = Math.floor(this.room.energyAvailable / 100) > 3 ? Math.floor(this.room.energyAvailable / 100) : 3;
      }
      if(segments < 3){
        console.log("Something wrong with room capacity")
      } else if(segments == 3){//300 energy - 150 Store
        bodyPartConstants = [CARRY, CARRY, CARRY, MOVE, MOVE, MOVE]
      } else if(segments == 4){//400 energy - 200 Store
        bodyPartConstants = [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE]
      } else if(segments == 5){//500 energy - 250 Store
        bodyPartConstants = [CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE]
      } else if(segments == 6){//600 energy - 300 Store
        bodyPartConstants = [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE]
      } else if(segments == 7){//700 energy - 350 Store
        bodyPartConstants = [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE]
      } else if(segments == 8){//800 energy - 400 Store
        bodyPartConstants = [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE]
      } else if(segments == 9){//900 energy - 450 Store
        bodyPartConstants = [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE]
      } else if(segments == 10){//1000 energy - 500 Store
        bodyPartConstants = [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE]
      } else if(segments == 11){//1100 energy - 550 Store
        bodyPartConstants = [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE]
      } else if(segments >= 12){//1200 energy - 600 Store
        bodyPartConstants = [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE]
      }
      return new SpawnTask(SpawnType.Carrier, this.areaId, "Carrier", bodyPartConstants);
    }
  }
  