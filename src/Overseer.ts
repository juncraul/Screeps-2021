import { Helper } from "Helper";
import SourceSite from "SourceSite";
import Task, { Activity, CreepType } from "Task";

export default class Overseer implements IOverseer {


  refresh(): void {
    let currentRoom: Room = Game.rooms["W6N1"];
    let tasks: Task[] = [];

    tasks = tasks.concat(this.overseeRoom(currentRoom));

    this.handleRoomTasks(currentRoom, tasks);
  }

  private overseeRoom(room: Room): Task[] {
    let tasks: Task[] = [];
    tasks = tasks.concat(this.handleHarvestSite(room));
    tasks = tasks.concat(this.handleConstructions(room));
    return tasks;
  }

  private handleHarvestSite(room: Room): Task[] {
    if (!room.controller)
      return [];
    let tasks: Task[] = [];
    let sources: Source[] = Helper.getRoomSources(room);
    sources.forEach(source => {
      let sourceSite: SourceSite = new SourceSite(source, room.controller!);
      tasks = tasks.concat(sourceSite.handleSourceSite());
    });
    return tasks;
  }

  private handleConstructions(room: Room): Task[] {
    if (!room.controller)
      return [];
    let tasks: Task[] = [];
    let constructionSites: ConstructionSite[] = Helper.getRoomConstructions(room);
    constructionSites.forEach(constructionSite => {
      tasks.push(new Task(Activity.Construct, CreepType.HarvesterWithCarry, constructionSite.pos))
    });
    return tasks;
  }

  private handleRoomTasks(room: Room, newTasks: Task[]) {
    newTasks.forEach(task => {
      let creeps: Creep[] = Helper.getRoomCreepsMineNoTask(room);
      switch (task.activity) {
        case Activity.Harvest:
          //Get first available creep or create a new one.
          //Will assign the task in the next tick.
          if (creeps.length > 0) {
            this.assignTaskToCreep(task, creeps[0]);
          } else {
            this.createNewCreep(room)
          }
          break;
        //case Activity.Construct:
        //    if(creeps.length > 0 && creeps[0].carry.energy > 0){
        //        this.assignTaskToCreep(task, creeps[0]);
        //    }
        //break;
      }
    });
  }

  private assignTaskToCreep(task: Task, creep: Creep) {
    switch (task.activity) {
      case Activity.Harvest:
        creep.memory = { role: "Harvester", room: task.targetPlace.roomName, working: false, task: task };
        let source: Source | null = task.targetPlace.findClosestByRange(FIND_SOURCES);
        if (source) {
          let creepIds: [string] = Helper.getCashedMemory(`Source-${source.id}`, []);
          creepIds.push(creep.id)
          Helper.setCashedMemory(`Source-${source.id}`, creepIds);
        }
        break;
      case Activity.Construct:
        creep.memory = { role: "Harvester", room: task.targetPlace.roomName, working: false, task: task };
        let constructionSite: ConstructionSite | null = task.targetPlace.findClosestByRange(FIND_MY_CONSTRUCTION_SITES);
        if (constructionSite) {
          let creepIds: [string] = Helper.getCashedMemory(`ConstructionSite-${constructionSite.id}`, []);
          creepIds.push(creep.id)
          Helper.setCashedMemory(`ConstructionSite-${constructionSite.id}`, creepIds);
        }
        break;
    }
  }

  private createNewCreep(room: Room): Creep | null {
    let spawns: StructureSpawn[] = Helper.getRoomSpawns(room);
    let theNewCreep: Creep | null = null;
    spawns.forEach(spawn => {
      if (spawn.spawning == null) {
        let creepName: string = `Harvester-${Game.time}`
        if (spawn.spawnCreep([WORK, CARRY, MOVE], creepName) == OK) {
          theNewCreep = Game.creeps[creepName];
        }
      }
    })
    return theNewCreep;
  }
}

interface IOverseer {
  refresh(): void;
}
