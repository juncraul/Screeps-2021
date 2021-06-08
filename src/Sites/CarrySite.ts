import { CreepBase } from "CreepBase";
import { GetRoomObjects } from "Helpers/GetRoomObjects";
import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseSite from "./BaseSite";


export default class CarrySite extends BaseSite {
    controller: StructureController;
    room: Room;
    maxWorkerCount: number;
    controllerLevel: number;
    containerNextToController: StructureContainer | null;
    spawns: StructureSpawn[];
    extensions: StructureExtension[];
    depositToGeneralStore: (StructureContainer)[];
    depositToLimitedStore: (StructureSpawn | StructureExtension | StructureTower)[];
    containersToCollectFrom: (StructureContainer | Ruin)[];
    droppedResourcesToCollectFrom: Resource[];
  
    constructor(controller: StructureController) {
      super("CarrySite", controller.room.name, controller.pos)
      this.controller = controller;
      this.maxWorkerCount = 1;
      this.room = controller.room;
      this.controllerLevel = controller.level;
      let potentialContainer = controller.pos.findInRange(FIND_STRUCTURES, 3, { filter: { structureType: STRUCTURE_CONTAINER } })[0];
      this.containerNextToController = (potentialContainer instanceof StructureContainer) ? potentialContainer : null;
      this.spawns = GetRoomObjects.getRoomSpawns(controller.room, true);
      this.extensions = GetRoomObjects.getRoomExtensions(controller.room, true);
      this.depositToGeneralStore = this.getGeneralDeposits();
      this.depositToLimitedStore = this.getLimitedDeposits();
      this.containersToCollectFrom = this.getContainersToCollectFrom();
      this.droppedResourcesToCollectFrom = this.getDroppedResourcesToCollectFrom(RESOURCE_ENERGY);
    }
  
    public handleCarrySite(): SpawnTask[] {
      let tasksForThisUpgradeSite: SpawnTask[] = [];
      if (this.creeps.length < this.maxWorkerCount + this.getNumberOfDyingCreeps()) {
        let task: SpawnTask | null = this.createNewCarrierCreeps();
        if (task) {
          tasksForThisUpgradeSite.push(task);
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
        if(!this.creeps[i].isEmpty() && this.creeps[i].isFree()){
          for(let j: number = 0; j < this.depositToLimitedStore.length; j ++){
            if(this.depositToLimitedStore[j].store.getFreeCapacity(RESOURCE_ENERGY) == 0)
              continue;
            this.creeps[i].addTask(new CreepTask(Activity.Deposit, this.depositToLimitedStore[j].pos))
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
      return tasksForThisUpgradeSite;
    }

    private getGeneralDeposits():(StructureContainer)[]{
      let structures: (StructureContainer)[] = [];
      if(this.containerNextToController)
        structures.push(this.containerNextToController);
      return structures;
    }

    private getLimitedDeposits():(StructureSpawn | StructureExtension | StructureTower)[]{
      let structures: (StructureSpawn | StructureExtension | StructureTower)[] = [];
      this.extensions.forEach(extension =>{
        structures.push(extension);
      })
      this.spawns.forEach(spawn =>{
        structures.push(spawn);
      })
      GetRoomObjects.getRoomCannons(this.room).forEach(cannon => {
        structures.push(cannon.tower);
      })
      return structures;
    }
  
    private createNewCarrierCreeps(): SpawnTask | null {
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
      } else if(segments >= 8){//800 energy - 400 Store
        bodyPartConstants = [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE]
      }
      return new SpawnTask(SpawnType.Carrier, this.siteId, "Carrier", bodyPartConstants);
    }
  }
  