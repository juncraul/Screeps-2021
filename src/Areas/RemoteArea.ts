import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";


export default class RemoteArea extends BaseArea {
    controller: StructureController | null;
    roomName: string;
    maxWorkerCount: number;
  
    constructor(roomName: string) {
      super("RemoteArea", roomName, new RoomPosition(25, 25, roomName), Game.rooms[roomName])
      this.maxWorkerCount = 1;
      this.roomName = roomName;
      if(Game.rooms[roomName] && Game.rooms[roomName].controller){
        this.controller = Game.rooms[roomName].controller!;
      } else{
        //We have no visiblity to this room.
        this.controller = null;
      }
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
      
      for (let i: number = 0; i < this.creeps.length; i++){
        if(this.creeps[i].isFree()){
          if(this.creeps[i].pos.roomName != this.roomName){
            this.creeps[i].addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, this.roomName)))
          }else{
            if(this.controller){
              this.creeps[i].addTask(new CreepTask(Activity.Reserve, this.controller.pos))
            }
          }
        }
      }
    }
  
    private createCreepForThisArea(): SpawnTask {
      return new SpawnTask(SpawnType.Claimer, this.areaId, "Claimer", [CLAIM, MOVE], this);
    }
  }
  