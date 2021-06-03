import { Helper } from "Helper";
import SourceSite from "Sites/SourceSite";
import CreepTask, { Activity } from "Tasks/CreepTask";
import UpgradeSite from "Sites/UpgradeSite";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";

export default class Overseer implements IOverseer {


  refresh(): void {
    let currentRoom: Room = Game.rooms["W6N1"];
    let tasks: SpawnTask[] = [];

    tasks = tasks.concat(this.overseeRoom(currentRoom));

    this.handleRoomTasks(currentRoom, tasks);
  }

  private overseeRoom(room: Room): SpawnTask[] {
    let tasks: SpawnTask[] = [];
    tasks = tasks.concat(this.handleHarvestSite(room));
    tasks = tasks.concat(this.handleUpgradeSite(room));
    //tasks = tasks.concat(this.handleConstructions(room));
    return tasks;
  }

  private handleHarvestSite(room: Room): SpawnTask[] {
    if (!room.controller)
      return [];
    let tasks: SpawnTask[] = [];
    let sources: Source[] = Helper.getRoomSources(room);
    sources.forEach(source => {
      let sourceSite: SourceSite = new SourceSite(source, room.controller!);
      tasks = tasks.concat(sourceSite.handleSourceSite());
    });
    return tasks;
  }

  private handleUpgradeSite(room: Room): SpawnTask[] {
    if (!room.controller)
      return [];
    let tasks: SpawnTask[] = [];
      let upgradeSite: UpgradeSite = new UpgradeSite(room.controller);
      tasks = tasks.concat(upgradeSite.handleUpgradeSite());
    return tasks;
  }

  //private handleConstructions(room: Room): SpawnTask[] {
  //  if (!room.controller)
  //    return [];
  //  let tasks: SpawnTask[] = [];
  //  let constructionSites: ConstructionSite[] = Helper.getRoomConstructions(room);
  //  constructionSites.forEach(constructionSite => {
  //    tasks.push(new CreepTask(Activity.Construct, constructionSite.pos))
  //  });
  //  return tasks;
  //}

  private handleRoomTasks(room: Room, newTasks: SpawnTask[]) {
    newTasks.forEach(task => {
        this.createNewCreep(room, task)
    });
  }

  // private assignTaskToCreep(task: CreepTask, creep: Creep) {
  //   switch (task.activity) {
  //     case Activity.Harvest:
  //       creep.memory = { role: "Harvester", room: task.targetPlace.roomName, working: false, task: task };
  //       let source: Source | null = task.targetPlace.findClosestByRange(FIND_SOURCES);
  //       if (source) {
  //         let creepIds: [string] = Helper.getCashedMemory(`Source-${source.id}`, []);
  //         creepIds.push(creep.id)
  //         Helper.setCashedMemory(`Source-${source.id}`, creepIds);
  //       }
  //       break;
  //     case Activity.Construct:
  //       creep.memory = { role: "Harvester", room: task.targetPlace.roomName, working: false, task: task };
  //       let constructionSite: ConstructionSite | null = task.targetPlace.findClosestByRange(FIND_MY_CONSTRUCTION_SITES);
  //       if (constructionSite) {
  //         let creepIds: [string] = Helper.getCashedMemory(`ConstructionSite-${constructionSite.id}`, []);
  //         creepIds.push(creep.id)
  //         Helper.setCashedMemory(`ConstructionSite-${constructionSite.id}`, creepIds);
  //       }
  //       break;
  //   }
  // }

  private createNewCreep(room: Room, task: SpawnTask): Creep | null {
    let spawns: StructureSpawn[] = Helper.getRoomSpawns(room);
    let theNewCreep: Creep | null = null;
    spawns.forEach(spawn => {
      if (spawn.spawning == null) {
        let creepName: string;
        switch(task.spawnType){
          case SpawnType.Harvester:
            creepName = `Harvester-${Game.time}`
            break;
          case SpawnType.Upgrader:
            creepName = `Upgrader-${Game.time}`
            break;
          default:
            throw `Spawn type not implemented: ${task.spawnType}`
        }
        if (spawn.spawnCreep([WORK, CARRY, MOVE], creepName) == OK) {
          theNewCreep = Game.creeps[creepName];
        }else{
          return;
        }
        let creepNames: [string];
        switch(task.spawnType){
          case SpawnType.Harvester:
            creepNames = Helper.getCashedMemory(`SourceSite-${task.siteId}`, []);
            creepNames.push(creepName)
            Helper.setCashedMemory(`SourceSite-${task.siteId}`, creepNames);
            break;
          case SpawnType.Upgrader:
            creepNames = Helper.getCashedMemory(`Controller-${task.siteId}`, []);
            creepNames.push(creepName)
            Helper.setCashedMemory(`Controller-${task.siteId}`, creepNames);
            break;
          default:
            throw `Spawn type not implemented: ${task.spawnType}`
        }
      }
    })
    return theNewCreep;
  }
}

interface IOverseer {
  refresh(): void;
}
