import { Helper } from "Helper";
import SourceSite from "Sites/SourceSite";
import CreepTask, { Activity } from "Tasks/CreepTask";
import UpgradeSite from "Sites/UpgradeSite";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import CarrySite from "Sites/CarrySite";

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
    tasks = tasks.concat(this.handleCarrySite(room));
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

  private handleCarrySite(room: Room): SpawnTask[] {
    if (!room.controller)
      return [];
    let tasks: SpawnTask[] = [];
      let carrySite: CarrySite = new CarrySite(room.controller);
      tasks = tasks.concat(carrySite.handleCarrySite());
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

  private createNewCreep(room: Room, task: SpawnTask): Creep | null {
    let spawns: StructureSpawn[] = Helper.getRoomSpawns(room);
    let theNewCreep: Creep | null = null;
    spawns.forEach(spawn => {
      if (spawn.spawning == null) {
        let creepName: string;
        let bodyPartConstant: BodyPartConstant[] = [];
        switch(task.spawnType){
          case SpawnType.Harvester:
            creepName = `Harvester-${Game.time}`;
            bodyPartConstant = [WORK, CARRY, MOVE];
            break;
          case SpawnType.Upgrader:
            creepName = `Upgrader-${Game.time}`;
            bodyPartConstant = [WORK, CARRY, MOVE];
            break;
          case SpawnType.Carrier:
            creepName = `Carrier-${Game.time}`;
            bodyPartConstant = [CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
            break;
          default:
            throw `Spawn type not implemented: ${task.spawnType}`;
        }
        if (spawn.spawnCreep(bodyPartConstant, creepName) == OK) {
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
          case SpawnType.Carrier:
            creepNames = Helper.getCashedMemory(`CarrySite-${task.siteId}`, []);
            creepNames.push(creepName)
            Helper.setCashedMemory(`CarrySite-${task.siteId}`, creepNames);
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

//MOVE	        50	Moves the creep. Reduces creep fatigue by 2/tick. See movement.
//WORK	        100	Harvests energy from target source. Gathers 2 energy/tick. Constructs a target structure. Builds the designated structure at a construction site, at 5 points/tick, consuming 1 energy/point. See building Costs. Repairs a target structure. Repairs a structure for 20 hits/tick. Consumes 0.1 energy/hit repaired, rounded up to the nearest whole number.
//CARRY	        50	Stores energy. Contains up to 50 energy units. Weighs nothing when empty.
//ATTACK	      80	Attacks a target creep/structure. Deals 30 damage/tick. Short-ranged attack (1 tile).
//RANGED_ATTACK	150	Attacks a target creep/structure. Deals 10 damage/tick. Long-ranged attack (1 to 3 tiles).
//HEAL	        250	Heals a target creep. Restores 12 hit points/tick at short range (1 tile) or 4 hits/tick at a distance (up to 3 tiles).
//TOUGH	        10	No effect other than the 100 hit points all body parts add. This provides a cheap way to add hit points to a creep.
//CLAIM	        600