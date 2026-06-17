import SourceArea from "Areas/SourceArea";
import MineralArea from "Areas/MineralArea";
import UpgradeArea from "Areas/UpgradeArea";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import CarryArea from "Areas/CarryArea";
import ConstructionArea from "Areas/ConstructionArea";
import { Cannon } from "Cannon";
import { GetRoomObjects } from "Helpers/GetRoomObjects";
import { BaseBuilder } from "BaseBuilder/BaseBuilder";
import RemoteArea from "Areas/RemoteArea";
import RemoteRebuildArea from "Areas/RemoteRebuildArea";
import UtilityArea from "Areas/UtilityArea";
import SeasonArea from "Areas/SeasonArea";
import RepairArea from "Areas/RepairArea";
import SoldierArea from "Areas/SoldierArea";

export default class Overseer implements IOverseer {
  public refresh(): void {
    const roomsWithSpawns = GetRoomObjects.getAllRoomsWithSpawns();
    roomsWithSpawns.forEach(roomWithSpawn => {
      let tasks: SpawnTask[] = [];
      const towers: StructureTower[] = GetRoomObjects.getRoomTowers(roomWithSpawn);
      tasks = tasks.concat(this.overseeRoom(roomWithSpawn));
      this.handleRoomTasks(roomWithSpawn, tasks);
      towers.forEach(tower => {
        const cannon = new Cannon(tower);
        cannon.cannonLogic();
      });
      BaseBuilder.logicCreateConstructionSites();
    });
  }

  private overseeRoom(room: Room): SpawnTask[] {
    const roomsToReserve = GetRoomObjects.getAllRoomsToReserve();
    const roomsToClaim = GetRoomObjects.getAllRoomsToClaim();
    const harvest = this.handleHarvestArea(room);
    const carry = this.handleCarryArea(room);
    const upgrade = this.handleUpgradeArea(room);
    const constructionTasks = this.handleConstructionArea(room);
    const repairTasks = this.handleRepairArea(room);
    const utilityTasks = this.handleUtilityArea(room);
    const soldierTasks = this.handleSoldierArea(room);
    let seasonTasks: SpawnTask[] = [];
    if (Memory.Keys.IsSeason) {
      seasonTasks = this.handleSeasonArea(room);
    }
    let remoteTasks: SpawnTask[] = [];
    for (const roomToReserve of roomsToReserve) {
      remoteTasks = remoteTasks.concat(
        this.handleRemoteArea(roomToReserve.roomName, false, roomToReserve.baseRoomName, roomToReserve.mineralOnly)
      );
    }
    for (const roomToClaim of roomsToClaim) {
      remoteTasks = remoteTasks.concat(this.handleRemoteArea(roomToClaim.roomName, true, roomToClaim.baseRoomName));
    }

    const remoteRebuildTasks: SpawnTask[] = [];
    for (const target of GetRoomObjects.getAllRemoteRebuildTargets().filter(t => t.baseRoomName === room.name)) {
      const rebuildArea = new RemoteRebuildArea(target.remoteRoomName, target.baseRoomName);
      remoteRebuildTasks.push(...rebuildArea.handleSpawnTasks());
      rebuildArea.handleThisArea();
      this.handleRemoteRebuildRoomAreas(target.remoteRoomName);
    }

    // Interleave tasks in the desired spawn priority order:
    // Harvester x2 -> Carry x1 -> Upgrader x1 -> Carry x1 -> Upgrader x1
    // Existing creeps count as filling their pattern slot so the order stays
    // stable across ticks regardless of which creeps have already been spawned.
    const spawnOrder: SpawnType[] = [
      SpawnType.Harvester,
      SpawnType.Carrier,
      SpawnType.Harvester,
      SpawnType.Upgrader,
      SpawnType.Carrier,
      SpawnType.Upgrader
    ];
    const existing: Record<number, number> = {
      [SpawnType.Harvester]: harvest.existing,
      [SpawnType.Carrier]: carry.existing,
      [SpawnType.Upgrader]: upgrade.existing
    };
    const taskBuckets: Record<number, SpawnTask[]> = {
      [SpawnType.Harvester]: [...harvest.tasks],
      [SpawnType.Carrier]: [...carry.tasks],
      [SpawnType.Upgrader]: [...upgrade.tasks],
      [SpawnType.Constructor]: [...constructionTasks],
      [SpawnType.Repairer]: [...repairTasks]
    };
    const ordered: SpawnTask[] = [];
    for (const type of spawnOrder) {
      if ((existing[type] ?? 0) > 0) {
        existing[type]--; // slot already filled by a live creep
      } else {
        const next = taskBuckets[type]?.shift();
        if (next) {
          ordered.push(next);
        }
      }
    }
    // Append any remaining tasks not consumed by the pattern
    const remaining = [
      ...(taskBuckets[SpawnType.Harvester] ?? []),
      ...(taskBuckets[SpawnType.Carrier] ?? []),
      ...(taskBuckets[SpawnType.Upgrader] ?? []),
      ...(taskBuckets[SpawnType.Constructor] ?? []),
      ...(taskBuckets[SpawnType.Repairer] ?? []),
      ...utilityTasks,
      ...soldierTasks,
      ...remoteTasks,
      ...remoteRebuildTasks,
      ...seasonTasks
    ];
    return ordered.concat(remaining);
  }

  private handleHarvestArea(room: Room): { tasks: SpawnTask[]; existing: number } {
    if (!room.controller) {
      return { tasks: [], existing: 0 };
    }
    let tasks: SpawnTask[] = [];
    let existing = 0;
    const sources: Source[] = GetRoomObjects.getRoomSources(room);
    sources.forEach(source => {
      const sourceArea: SourceArea = new SourceArea(source, room.controller!);
      tasks = tasks.concat(sourceArea.handleSpawnTasks());
      existing += sourceArea.creeps.length;
      sourceArea.handleThisArea();
    });

    const mineral = GetRoomObjects.getRoomMineral(room, false);
    if (mineral) {
      const mineralArea = new MineralArea(mineral, room.controller);
      tasks = tasks.concat(mineralArea.handleSpawnTasks());
      existing += mineralArea.creeps.length;
      mineralArea.handleThisArea();
    }

    return { tasks, existing };
  }

  private handleUpgradeArea(room: Room): { tasks: SpawnTask[]; existing: number } {
    if (!room.controller) {
      return { tasks: [], existing: 0 };
    }
    const upgradeArea: UpgradeArea = new UpgradeArea(room.controller);
    const tasks = upgradeArea.handleSpawnTasks();
    const existing = upgradeArea.creeps.length;
    upgradeArea.handleThisArea();
    return { tasks, existing };
  }

  private handleCarryArea(room: Room): { tasks: SpawnTask[]; existing: number } {
    if (!room.controller) {
      return { tasks: [], existing: 0 };
    }
    const carryArea: CarryArea = new CarryArea(room.controller);
    const tasks = carryArea.handleSpawnTasks();
    const existing = carryArea.creeps.length;
    carryArea.handleThisArea();
    return { tasks, existing };
  }

  private handleConstructionArea(room: Room): SpawnTask[] {
    if (!room.controller) {
      return [];
    }
    let tasks: SpawnTask[] = [];
    const constructionArea: ConstructionArea = new ConstructionArea(room.controller);
    tasks = tasks.concat(constructionArea.handleSpawnTasks());
    constructionArea.handleThisArea();
    return tasks;
  }

  private handleRepairArea(room: Room): SpawnTask[] {
    if (!room.controller) {
      return [];
    }
    let tasks: SpawnTask[] = [];
    const repairArea: RepairArea = new RepairArea(room.controller);
    tasks = tasks.concat(repairArea.handleSpawnTasks());
    repairArea.handleThisArea();
    return tasks;
  }

  private handleRemoteRebuildRoomAreas(remoteRoomName: string): void {
    const remoteRoom = Game.rooms[remoteRoomName];
    if (!remoteRoom || !remoteRoom.controller) return;

    new ConstructionArea(remoteRoom.controller).handleThisArea();
    new CarryArea(remoteRoom.controller).handleThisArea();
    new UpgradeArea(remoteRoom.controller).handleThisArea();
    GetRoomObjects.getRoomSources(remoteRoom).forEach(source => {
      new SourceArea(source, remoteRoom.controller!).handleThisArea();
    });
  }

  private handleRemoteArea(
    roomName: string,
    claimThisRoom = false,
    baseRoomName?: string,
    mineralOnly = false
  ): SpawnTask[] {
    let tasks: SpawnTask[] = [];
    const remoteArea: RemoteArea = new RemoteArea(roomName, claimThisRoom, baseRoomName, mineralOnly);
    tasks = tasks.concat(remoteArea.handleSpawnTasks());
    remoteArea.handleThisArea();
    return tasks;
  }

  private handleUtilityArea(room: Room): SpawnTask[] {
    let tasks: SpawnTask[] = [];
    const storage: StructureStorage | null = GetRoomObjects.getRoomStorage(room);
    if (!storage) {
      return [];
    }
    const utilityArea: UtilityArea = new UtilityArea(storage);
    tasks = tasks.concat(utilityArea.handleSpawnTasks());
    utilityArea.handleThisArea();
    return tasks;
  }

  private handleSoldierArea(room: Room): SpawnTask[] {
    const flags = SoldierArea.detectAllFlags();
    if (flags.length === 0) return [];

    const soldierAreas = flags
      .filter(flag => !flag.baseRoomName || flag.baseRoomName === room.name)
      .map(flag => new SoldierArea(flag));

    if (soldierAreas.length === 0) {
      return [];
    }

    const tasks: SpawnTask[] = [];

    for (const area of soldierAreas) {
      tasks.push(...area.handleSpawnTasks());
      area.handleThisArea();
    }

    SoldierArea.drawLegend(soldierAreas, room);
    return tasks;
  }

  private handleSeasonArea(room: Room): SpawnTask[] {
    const seasonArea = new SeasonArea(room.name);
    const tasks: SpawnTask[] = seasonArea.handleSpawnTasks();
    seasonArea.handleThisArea();
    return tasks;
  }

  private handleRoomTasks(room: Room, newTasks: SpawnTask[]) {
    if (newTasks.length > 0) {
      room.visual.text("List of spawns", 30, 25, { align: "left", opacity: 0.5, color: "#ff0000" });
      for (let i = 0; i < newTasks.length; i++) {
        room.visual.text(
          `${newTasks[i].getSpawnTypeText()} - ${newTasks[i].getBodyPartAsTextAggregated()}`,
          30,
          26 + i,
          { align: "left", opacity: 0.5, color: "#ff0000" }
        );
      }
    }
    if (newTasks.length > 0) {
      // Will try to spawn only the first creep in the list.
      this.createNewCreep(room, newTasks[0]);
    }
  }

  private createNewCreep(room: Room, task: SpawnTask): Creep | null {
    const spawns: StructureSpawn[] = GetRoomObjects.getRoomSpawns(room, true);
    let theNewCreep: Creep | null = null;
    spawns.forEach(spawn => {
      if (spawn.spawning == null) {
        const creepName = task.namePrefix ? `${task.namePrefix}-${Game.time}` : `${task.roleName}-${Game.time}`;
        if (spawn.spawnCreep(task.bodyPartConstant, creepName) === OK) {
          theNewCreep = Game.creeps[creepName];
          theNewCreep.memory.role = task.roleName;
          if (task.spawnRoomName) {
            theNewCreep.memory.seasonSpawnRoom = task.spawnRoomName;
          }
          task.area.handleNewCreepMemory(creepName);
        } else {
          return;
        }
      }
    });
    return theNewCreep;
  }
}

interface IOverseer {
  refresh(): void;
}

// MOVE	        50	Moves the creep. Reduces creep fatigue by 2/tick. See movement.
// WORK	        100	Harvests energy from target source. Gathers 2 energy/tick. Constructs a target structure. Builds the designated structure at a construction site, at 5 points/tick, consuming 1 energy/point. See building Costs. Repairs a target structure. Repairs a structure for 20 hits/tick. Consumes 0.1 energy/hit repaired, rounded up to the nearest whole number.
// CARRY	        50	Stores energy. Contains up to 50 energy units. Weighs nothing when empty.
// ATTACK	      80	Attacks a target creep/structure. Deals 30 damage/tick. Short-ranged attack (1 tile).
// RANGED_ATTACK	150	Attacks a target creep/structure. Deals 10 damage/tick. Long-ranged attack (1 to 3 tiles).
// HEAL	        250	Heals a target creep. Restores 12 hit points/tick at short range (1 tile) or 4 hits/tick at a distance (up to 3 tiles).
// TOUGH	        10	No effect other than the 100 hit points all body parts add. This provides a cheap way to add hit points to a creep.
// CLAIM	        600
