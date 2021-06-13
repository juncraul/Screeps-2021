
import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";


export default class CarryArea extends BaseArea {
    maxWorkerCount: number;
    storage: StructureStorage;
    terminal: StructureTerminal | null;
    link: StructureLink | null;
    labs: StructureLab[];
  
    constructor(storage: StructureStorage) {
      super("UtilityArea", storage.room.name, storage.pos, storage.room)
      this.maxWorkerCount = 1;
      this.storage = storage;
      this.terminal = GetRoomObjects.getRoomTerminal(storage.room);
      this.link = GetRoomObjects.getWithinRangeLink(storage.pos, 3)
      this.labs = GetRoomObjects.getRoomLabs(storage.room);
    }

    public handleSpawnTasks(): SpawnTask[]{
      let tasksForThisArea: SpawnTask[] = [];
      if (this.creeps.length < this.maxWorkerCount + this.getNumberOfDyingCreeps()) {
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
          if(this.link && this.link.store.energy > 100){
            this.creeps[i].addTask(new CreepTask(Activity.Collect, this.link.pos));
          }
        }
        if(this.creeps[i].isFull() && this.creeps[i].isFree()){
          if(this.storage){
            this.creeps[i].addTask(new CreepTask(Activity.Deposit, this.storage.pos));
          }
        }
      }
    }
  
    private createCreepForThisArea(): SpawnTask | null {
      let bodyPartConstants: BodyPartConstant[] =[]
      let segments = Math.floor(this.room.energyCapacityAvailable / 100);//Carry-50; Move-50
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
      return new SpawnTask(SpawnType.Carrier, this.areaId, "Carrier", bodyPartConstants, this);
    }
  }
  