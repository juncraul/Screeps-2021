import SourceArea from "Areas/BaseRoom/SourceArea";
import MineralArea from "Areas/BaseRoom/MineralArea";
import UpgradeArea from "Areas/BaseRoom/UpgradeArea";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import CarryArea from "Areas/BaseRoom/CarryArea";
import ConstructionArea from "Areas/BaseRoom/ConstructionArea";
import { Cannon } from "Areas/Military/Defense/Cannon";
import { SafeMode } from "Areas/Military/Defense/SafeMode";
import { GetRoomObjects, RemoteRoomMode } from "Helpers/GetRoomObjects";
import { BaseBuilder } from "BaseBuilder/BaseBuilder";
import RemoteArea from "Areas//RemoteArea/RemoteArea";
import RemoteRebuildArea from "Areas/RemoteRebuildArea";
import UtilityArea from "Areas/BaseRoom/UtilityArea";
import SeasonArea from "Areas/SeasonArea";
import RepairArea from "Areas/BaseRoom/RepairArea";
import SoldierArea from "./Areas/Military/SoldierArea";
import DefenseArea from "./Areas/Military/Defense/DefenseArea";
import LooterArea from "./Areas/Military/LooterArea";
import SourceKeeperArea from "./Areas/Military/SourceKeeperArea";
import StationaryFillerArea from "Areas/BaseRoom/StationaryFillerArea";
import MarketArea from "Areas/BaseRoom/MarketArea";
import BaseRoomStats from "Areas/BaseRoom/BaseRoomStats";
import ScoutArea from "Areas/BaseRoom/ScoutArea";
import { Helper } from "Helpers/Helper";

export default class Overseer implements IOverseer {
  public refresh(): void {
    const roomsWithSpawns = GetRoomObjects.getAllClaimedRooms();
    roomsWithSpawns.forEach(roomWithSpawn => {
      let tasks: SpawnTask[] = [];
      const towers: StructureTower[] = GetRoomObjects.getRoomTowers(roomWithSpawn);
      tasks = tasks.concat(this.overseeRoom(roomWithSpawn));
      this.handleRoomTasks(roomWithSpawn, tasks);
      towers.forEach(tower => {
        const cannon = new Cannon(tower);
        cannon.cannonLogic();
      });
      SafeMode.run(roomWithSpawn, towers);
      BaseRoomStats.drawRoomVisual(roomWithSpawn);
      BaseBuilder.automaticFlagPlacement(roomWithSpawn);
      BaseBuilder.logicCreateConstructionSites();
    });
  }

  private overseeRoom(room: Room): SpawnTask[] {
    // Used for debugging wall repair order
    // GetRoomObjects.getClosestWallRampartToRepairAll(room);
    const scout = this.handleScoutArea(room);
    const remoteRooms = GetRoomObjects.getAllRoomsToRemote(room);
    const harvest = this.handleHarvestArea(room);
    const carry = this.handleCarryArea(room);
    const upgrade = this.handleUpgradeArea(room);
    const construction = this.handleConstructionArea(room);
    const repair = this.handleRepairArea(room);
    const market = this.handleMarketArea(room);
    const utility = this.handleUtilityArea(room);
    const stationaryfiller = this.handleStationaryFillerArea(room);
    const defense = this.handleDefenseArea(room);
    const soldierTasks = this.handleSoldierArea(room);
    const looterTasks = this.handleLooterArea(room);
    const sourceKeeperTasks = this.handleSourceKeeperArea(room);
    let seasonTasks: SpawnTask[] = [];
    if (Helper.getCashedMemory("IsSeason", false)) {
      seasonTasks = this.handleSeasonArea(room);
    }
    let remoteTasks: SpawnTask[] = [];
    for (const remoteRoom of remoteRooms) {
      remoteTasks = remoteTasks.concat(
        this.handleRemoteArea(remoteRoom.roomName, remoteRoom.mode, remoteRoom.baseRoomName, remoteRoom.mineralOnly)
      );
    }

    const remoteRebuildTasks: SpawnTask[] = [];
    for (const target of GetRoomObjects.getAllRemoteRebuildTargets().filter(t => t.baseRoomName === room.name)) {
      const rebuildArea = new RemoteRebuildArea(target.remoteRoomName, target.baseRoomName, target.flag);
      remoteRebuildTasks.push(...rebuildArea.handleSpawnTasks());
      rebuildArea.handleThisArea();
      this.handleRemoteRebuildRoomAreas(target.remoteRoomName);
    }

    // Interleave tasks in the desired spawn priority order:
    // Harvester x2 -> Carry x1 -> Upgrader x1 -> Carry x1 -> Upgrader x1
    // Existing creeps count as filling their pattern slot so the order stays
    // stable across ticks regardless of which creeps have already been spawned.
    const spawnOrder: CreepType[] = [
      CreepType.Harvester,
      CreepType.Carrier,
      CreepType.StationaryFiller,
      CreepType.StationaryFiller,
      CreepType.StationaryFiller,
      CreepType.StationaryFiller,
      CreepType.StationaryFiller,
      CreepType.StationaryFiller,
      CreepType.StationaryFiller,
      CreepType.StationaryFiller,
      CreepType.Carrier,
      CreepType.Harvester
    ];
    const existing: Record<number, number> = {
      [CreepType.Harvester]: harvest.existing,
      [CreepType.Carrier]: carry.existing,
      [CreepType.Upgrader]: upgrade.existing,
      [CreepType.StationaryFiller]: stationaryfiller.existing
    };
    const taskBuckets: Record<number, SpawnTask[]> = {
      [CreepType.Harvester]: [...harvest.tasks],
      [CreepType.Carrier]: [...carry.tasks],
      [CreepType.Upgrader]: [...upgrade.tasks],
      [CreepType.Constructor]: [...construction.tasks],
      [CreepType.Repairer]: [...repair.tasks],
      [CreepType.StationaryFiller]: [...stationaryfiller.tasks]
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
      ...(taskBuckets[CreepType.Harvester] ?? []),
      ...(taskBuckets[CreepType.Carrier] ?? []),
      ...(taskBuckets[CreepType.Upgrader] ?? []),
      ...(taskBuckets[CreepType.Constructor] ?? []),
      ...(taskBuckets[CreepType.Repairer] ?? []),
      ...stationaryfiller.tasks,
      ...market.tasks,
      ...utility.tasks,
      ...soldierTasks,
      ...sourceKeeperTasks,
      ...looterTasks,
      ...remoteTasks,
      ...remoteRebuildTasks,
      ...scout.tasks,
      ...seasonTasks
    ];

    this.drawBaseRoomAreaStats(room, {
      SourceArea: { existing: harvest.sourceExisting, queued: harvest.sourceTasks.length },
      MineralArea: { existing: harvest.mineralExisting, queued: harvest.mineralTasks.length },
      CarryArea: { existing: carry.existing, queued: carry.tasks.length },
      ConstructionArea: { existing: construction.existing, queued: construction.tasks.length },
      RepairArea: { existing: repair.existing, queued: repair.tasks.length },
      UpgradeArea: { existing: upgrade.existing, queued: upgrade.tasks.length },
      UtilityArea: { existing: utility.existing, queued: utility.tasks.length },
      MarketArea: { existing: market.existing, queued: market.tasks.length },
      StationaryFillerArea: { existing: stationaryfiller.existing, queued: stationaryfiller.tasks.length },
      ScoutArea: { existing: scout.existing, queued: scout.tasks.length },
      DefenseArea: { existing: defense.existing, queued: defense.tasks.length }
    });

    return [...defense.tasks, ...ordered, ...remaining];
  }

  private handleHarvestArea(
    room: Room
  ): {
    tasks: SpawnTask[];
    existing: number;
    sourceTasks: SpawnTask[];
    sourceExisting: number;
    mineralTasks: SpawnTask[];
    mineralExisting: number;
  } {
    if (!room.controller) {
      return {
        tasks: [],
        existing: 0,
        sourceTasks: [],
        sourceExisting: 0,
        mineralTasks: [],
        mineralExisting: 0
      };
    }
    const sourceTasks: SpawnTask[] = [];
    let sourceExisting = 0;
    const mineralTasks: SpawnTask[] = [];
    let mineralExisting = 0;

    const spawn: StructureSpawn | null = GetRoomObjects.getRoomSpawns(room, true)[0] ?? null;
    let sources: Source[] = GetRoomObjects.getRoomSources(room);
    if (spawn) {
      sources = sources.sort((a, b) => spawn.pos.getRangeTo(a) - spawn.pos.getRangeTo(b));
    }
    sources.forEach(source => {
      const sourceArea: SourceArea = new SourceArea(source, room.controller!);
      sourceTasks.push(...sourceArea.handleSpawnTasks());
      sourceExisting += sourceArea.creeps.length;
      sourceArea.handleThisArea();
    });

    const mineral = GetRoomObjects.getRoomMineral(room, false);
    if (mineral) {
      const mineralArea = new MineralArea(mineral, room.controller);
      mineralTasks.push(...mineralArea.handleSpawnTasks());
      mineralExisting += mineralArea.creeps.length;
      mineralArea.handleThisArea();
    }

    return {
      tasks: sourceTasks.concat(mineralTasks),
      existing: sourceExisting + mineralExisting,
      sourceTasks,
      sourceExisting,
      mineralTasks,
      mineralExisting
    };
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

  private handleConstructionArea(room: Room): { tasks: SpawnTask[]; existing: number } {
    if (!room.controller) {
      return { tasks: [], existing: 0 };
    }
    const constructionArea: ConstructionArea = new ConstructionArea(room.controller);
    const tasks = constructionArea.handleSpawnTasks();
    const existing = constructionArea.creeps.length;
    constructionArea.handleThisArea();
    return { tasks, existing };
  }

  private handleRepairArea(room: Room): { tasks: SpawnTask[]; existing: number } {
    if (!room.controller) {
      return { tasks: [], existing: 0 };
    }
    const repairArea: RepairArea = new RepairArea(room.controller);
    const tasks = repairArea.handleSpawnTasks();
    const existing = repairArea.creeps.length;
    repairArea.handleThisArea();

    return { tasks, existing };
  }

  private handleDefenseArea(room: Room): { tasks: SpawnTask[]; existing: number } {
    const flags = DefenseArea.detectAllFlags().filter(f => f.roomName === room.name);
    if (flags.length === 0) {
      return { tasks: [], existing: 0 };
    }

    const tasks: SpawnTask[] = [];
    let existing = 0;

    for (const flagConfig of flags) {
      const area = new DefenseArea(flagConfig);
      tasks.push(...area.handleSpawnTasks(room));
      existing += area.creeps.length;
      area.handleThisArea();
    }

    return { tasks, existing };
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
    remoteMode: RemoteRoomMode = RemoteRoomMode.Reserve,
    baseRoomName?: string,
    mineralOnly = false
  ): SpawnTask[] {
    if (roomName === "W6N3") console.log("handleRemoteArea", roomName);
    let tasks: SpawnTask[] = [];
    const remoteArea: RemoteArea = new RemoteArea(roomName, remoteMode, baseRoomName, mineralOnly);
    tasks = tasks.concat(remoteArea.handleSpawnTasks());
    remoteArea.handleThisArea();
    return tasks;
  }

  private handleScoutArea(room: Room): { tasks: SpawnTask[]; existing: number } {
    const scoutArea: ScoutArea = new ScoutArea(room);
    const tasks = scoutArea.handleSpawnTasks();
    const existing = scoutArea.creeps.length;
    scoutArea.handleThisArea();
    return { tasks, existing };
  }

  private handleUtilityArea(room: Room): { tasks: SpawnTask[]; existing: number } {
    const storage: StructureStorage | null = GetRoomObjects.getRoomStorage(room);
    if (!storage) {
      return { tasks: [], existing: 0 };
    }
    const utilityArea: UtilityArea = new UtilityArea(storage);
    const tasks = utilityArea.handleSpawnTasks();
    const existing = utilityArea.creeps.length;
    utilityArea.handleThisArea();
    return { tasks, existing };
  }

  private handleMarketArea(room: Room): { tasks: SpawnTask[]; existing: number } {
    const storage: StructureStorage | null = GetRoomObjects.getRoomStorage(room);
    if (!storage) {
      return { tasks: [], existing: 0 };
    }

    const marketArea: MarketArea = new MarketArea(storage);
    const tasks = marketArea.handleSpawnTasks();
    const existing = marketArea.creeps.length;
    marketArea.handleThisArea();
    return { tasks, existing };
  }

  private handleStationaryFillerArea(room: Room): { tasks: SpawnTask[]; existing: number } {
    if (!StationaryFillerArea.createThisAreaForRoom(room)) return { tasks: [], existing: 0 };

    const stationaryFillerArea: StationaryFillerArea = new StationaryFillerArea(room);
    const tasks = stationaryFillerArea.handleSpawnTasks();
    const existing = stationaryFillerArea.creeps.length;
    stationaryFillerArea.handleThisArea();
    return { tasks, existing };
  }

  private drawBaseRoomAreaStats(room: Room, stats: Record<string, { existing: number; queued: number }>): void {
    const x = 20;
    let y = 2;
    const titleStyle: TextStyle = { align: "left", opacity: 0.9, color: "#a8ff9e", font: "0.8 Trebuchet MS" };
    const lineStyle: TextStyle = { align: "left", opacity: 0.75, color: "#d4ffd0", font: "0.7 Trebuchet MS" };

    room.visual.text("BaseRoom Area Creep Counts", x, y, titleStyle);
    y += 0.7;

    for (const [areaName, count] of Object.entries(stats)) {
      room.visual.text(`${areaName}: ${count.existing} live (+${count.queued} queued)`, x, y, lineStyle);
      y += 0.65;
    }
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
      tasks.push(...area.handleSpawnTasks(room));
      area.handleThisArea();
    }

    SoldierArea.drawLegend(soldierAreas, room);
    return tasks;
  }

  private handleLooterArea(room: Room): SpawnTask[] {
    const flags = LooterArea.detectAllFlags();
    if (flags.length === 0) {
      return [];
    }

    const looterAreas = flags
      .filter(flag => !flag.baseRoomName || flag.baseRoomName === room.name)
      .map(flag => new LooterArea(flag));

    if (looterAreas.length === 0) {
      return [];
    }

    const tasks: SpawnTask[] = [];

    for (const area of looterAreas) {
      tasks.push(...area.handleSpawnTasks(room));
      area.handleThisArea();
    }

    return tasks;
  }

  private handleSourceKeeperArea(room: Room): SpawnTask[] {
    const flags = SourceKeeperArea.detectAllFlags();
    if (flags.length === 0) return [];

    const sourceKeeperAreas = flags
      .filter(flag => flag.spawnRoomName === room.name)
      .map(flag => new SourceKeeperArea(flag));
    if (sourceKeeperAreas.length === 0) {
      return [];
    }

    const tasks: SpawnTask[] = [];

    for (const area of sourceKeeperAreas) {
      tasks.push(...area.handleSpawnTasks(room));
      area.handleThisArea();
    }

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
        room.visual.text(`${newTasks[i].namePrefix ?? ""} - ${newTasks[i].getBodyPartAsTextAggregated()}`, 30, 26 + i, {
          align: "left",
          opacity: 0.5,
          color: "#ff0000"
        });
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
        const roleName = task.getCreepTypeText();
        const creepName = task.namePrefix ? `${task.namePrefix}-${Game.time}` : `${roleName}-${Game.time}`;
        if (spawn.spawnCreep(task.bodyPartConstant, creepName, { directions: task.spawnDirection }) === OK) {
          theNewCreep = Game.creeps[creepName];
          theNewCreep.memory.role = roleName;
          const spentEnergy = task.bodyPartConstant.reduce((sum, bodyPart) => sum + BODYPART_COST[bodyPart], 0);
          BaseRoomStats.addSpent(room.name, spentEnergy, `spawn:${roleName}`);
          if (task.spawnRoomName) {
            theNewCreep.memory.seasonSpawnRoom = task.spawnRoomName;
          }
          if (task.area.memoryType.startsWith("Remote")) {
            theNewCreep.memory.remoteRoomName = task.area.areaId;
            RemoteArea.addRemoteRoomExpense(task.area.areaId, spentEnergy);
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
