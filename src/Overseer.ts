import SourceArea from "Areas/SourceArea";
import UpgradeArea from "Areas/UpgradeArea";
import SpawnTask from "Tasks/SpawnTask";
import CarryArea from "Areas/CarryArea";
import ConstructionArea from "Areas/ConstructionArea";
import { Cannon } from "Cannon";
import { GetRoomObjects } from "Helpers/GetRoomObjects";
import { BaseBuilder } from "BaseBuilder/BaseBuilder";
import RemoteArea from "Areas/RemoteArea";
import UtilityArea from "Areas/UtilityArea";

export default class Overseer implements IOverseer {


  refresh(): void {
    let roomsWithSpawns = GetRoomObjects.getAllRoomsWithSpawns();
    roomsWithSpawns.forEach(roomWithSpawn => {
      let tasks: SpawnTask[] = [];
      let towers: StructureTower[] = GetRoomObjects.getRoomTowers(roomWithSpawn);
  
      tasks = tasks.concat(this.overseeRoom(roomWithSpawn));
  
      this.handleRoomTasks(roomWithSpawn, tasks);
      towers.forEach(tower => {
        let cannon = new Cannon(tower);
        cannon.cannonLogic()})
      BaseBuilder.logicCreateConstructionSites();
    })
  }

  private overseeRoom(room: Room): SpawnTask[] {
    let tasks: SpawnTask[] = [];
    let roomsToReserve = GetRoomObjects.getAllRoomsToReserve();
    tasks = tasks.concat(this.handleHarvestArea(room));
    tasks = tasks.concat(this.handleUpgradeArea(room));
    tasks = tasks.concat(this.handleCarryArea(room));
    tasks = tasks.concat(this.handleConstructionArea(room));
    tasks = tasks.concat(this.handleUtilityArea(room));
    for(let i = 0; i < roomsToReserve.length; i ++)
      tasks = tasks.concat(this.handleRemoteArea(roomsToReserve[i]));
    return tasks;
  }

  private handleHarvestArea(room: Room): SpawnTask[] {
    if (!room.controller)
      return [];
    let tasks: SpawnTask[] = [];
    let sources: Source[] = GetRoomObjects.getRoomSources(room);
    sources.forEach(source => {
      let sourceArea: SourceArea = new SourceArea(source, room.controller!);
      tasks = tasks.concat(sourceArea.handleSpawnTasks());
      sourceArea.handleThisArea();
    });
    return tasks;
  }

  private handleUpgradeArea(room: Room): SpawnTask[] {
    if (!room.controller)
      return [];
    let tasks: SpawnTask[] = [];
      let upgradeArea: UpgradeArea = new UpgradeArea(room.controller);
      tasks = tasks.concat(upgradeArea.handleSpawnTasks());
      upgradeArea.handleThisArea();
    return tasks;
  }

  private handleCarryArea(room: Room): SpawnTask[] {
    if (!room.controller)
      return [];
    let tasks: SpawnTask[] = [];
      let carryArea: CarryArea = new CarryArea(room.controller);
      tasks = tasks.concat(carryArea.handleSpawnTasks());
      carryArea.handleThisArea();
    return tasks;
  }

  private handleConstructionArea(room: Room): SpawnTask[] {
    if (!room.controller)
      return [];
    let tasks: SpawnTask[] = [];
      let constructionArea: ConstructionArea = new ConstructionArea(room.controller);
      tasks = tasks.concat(constructionArea.handleSpawnTasks());
      constructionArea.handleThisArea();
    return tasks;
  }

  private handleRemoteArea(roomName: string): SpawnTask[] {
    let tasks: SpawnTask[] = [];
      let remoteArea: RemoteArea = new RemoteArea(roomName);
      tasks = tasks.concat(remoteArea.handleSpawnTasks());
      remoteArea.handleThisArea();
    return tasks;
  }

  private handleUtilityArea(room: Room): SpawnTask[] {
    let tasks: SpawnTask[] = [];
      let storage: StructureStorage | null = GetRoomObjects.getRoomStorage(room);
      if(!storage){
        return [];
      }
      let utilityArea: UtilityArea = new UtilityArea(storage);
      tasks = tasks.concat(utilityArea.handleSpawnTasks());
      utilityArea.handleThisArea();
    return tasks;
  }

  private handleRoomTasks(room: Room, newTasks: SpawnTask[]) {
    if(newTasks.length > 0){
      room.visual.text("List of spawns", 30, 25, { align: 'left', opacity: 0.5, color: "#ff0000" });
      for(let i: number = 0; i < newTasks.length; i ++){
        room.visual.text(newTasks[i].getSpawnTypeText(), 30, 26 + i, { align: 'left', opacity: 0.5, color: "#ff0000" });
      }
    }
    if(newTasks.length > 0){//Will try to spawn only the first creep in the list.
      this.createNewCreep(room, newTasks[0])
    }
  }

  private createNewCreep(room: Room, task: SpawnTask): Creep | null {
    let spawns: StructureSpawn[] = GetRoomObjects.getRoomSpawns(room, true);
    let theNewCreep: Creep | null = null;
    spawns.forEach(spawn => {
      if (spawn.spawning == null) {
        let creepName: string = `${task.name}-${Game.time}`;
        if (spawn.spawnCreep(task.bodyPartConstant, creepName) == OK) {
          theNewCreep = Game.creeps[creepName];
          task.area.handleNewCreepMemory(creepName);
        }else{
          return;
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