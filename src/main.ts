import { ErrorMapper } from "utils/ErrorMapper";
import Overseer from "Overseer";
import { CreepBase } from "CreepBase";
import { GetRoomObjects } from "Helpers/GetRoomObjects";
import "./Prototypes/RoomVisual"; // Prototypes used in Visualizer class
import { Helper } from "Helpers/Helper";
import CreepTask from "Tasks/CreepTask";
import SpawnTask from "Tasks/SpawnTask";
import BaseRoomStats from "Areas/BaseRoom/BaseRoomStats";
import SourceArea from "Areas/BaseRoom/SourceArea";
import MineralArea from "Areas/BaseRoom/MineralArea";
import Season11ThoriumArea from "Areas/Seasons/Season11/Season11ThoriumArea";
import UpgradeArea from "Areas/BaseRoom/UpgradeArea";
import CarryArea from "Areas/BaseRoom/CarryArea";
import ConstructionArea from "Areas/BaseRoom/ConstructionArea";
import UtilityArea from "Areas/BaseRoom/UtilityArea";
import Season10ScoutCollectorArea from "Areas/Seasons/Season10/Season10ScoutCollectorArea";
import RepairArea from "Areas/BaseRoom/RepairArea";
import StationaryFillerArea from "Areas/BaseRoom/StationaryFillerArea";
import MarketArea from "Areas/BaseRoom/MarketArea";
import LabArea from "Areas/BaseRoom/LabArea";
import ScoutArea from "Areas/BaseRoom/ScoutArea";
import { BaseBuilder } from "BaseBuilder/BaseBuilder";
import RemoteArea from "Areas/RemoteArea/RemoteArea";
import RemoteRebuildArea from "Areas/RemoteRebuildArea";
import SoldierArea from "Areas/Military/SoldierArea";
import DefenseArea from "Areas/Military/Defense/DefenseArea";
import LooterArea from "Areas/Military/LooterArea";
import SourceKeeperArea from "Areas/Military/SourceKeeperArea";
import { Cannon } from "Areas/Military/Defense/Cannon";
import { SafeMode } from "Areas/Military/Defense/SafeMode";
import EventHandler from "Helpers/EventHandler";
import profiler from "screeps-profiler";

// Profiler githug: https://github.com/screepers/screeps-profiler
// Profiler command: Game.profiler.profile(20)
const profilerTargets: [{ prototype: unknown }, string][] = [
  [Overseer, "Overseer"],
  [CreepBase, "CreepBase"],
  [CreepTask, "CreepTask"],
  [SpawnTask, "SpawnTask"],
  [GetRoomObjects, "GetRoomObjects"],
  [Helper, "Helper"],
  [ErrorMapper, "ErrorMapper"],
  [BaseRoomStats, "BaseRoomStats"],
  [SourceArea, "SourceArea"],
  [MineralArea, "MineralArea"],
  [Season11ThoriumArea, "Season11ThoriumArea"],
  [UpgradeArea, "UpgradeArea"],
  [CarryArea, "CarryArea"],
  [ConstructionArea, "ConstructionArea"],
  [UtilityArea, "UtilityArea"],
  [Season10ScoutCollectorArea, "Season10ScoutCollectorArea"],
  [RepairArea, "RepairArea"],
  [StationaryFillerArea, "StationaryFillerArea"],
  [MarketArea, "MarketArea"],
  [LabArea, "LabArea"],
  [ScoutArea, "ScoutArea"],
  [BaseBuilder, "BaseBuilder"],
  [RemoteArea, "RemoteArea"],
  [RemoteRebuildArea, "RemoteRebuildArea"],
  [SoldierArea, "SoldierArea"],
  [DefenseArea, "DefenseArea"],
  [LooterArea, "LooterArea"],
  [SourceKeeperArea, "SourceKeeperArea"],
  [Cannon, "Cannon"],
  [SafeMode, "SafeMode"],
  [EventHandler, "EventHandler"]
];

profilerTargets.forEach(([targetClass, label]) => profiler.registerClass(targetClass, label));
profiler.enable();

function normalizeProfilerMemory(): void {
  if (!("profiler" in Memory) || !Memory.profiler) {
    return;
  }

  const profilerMemory = Memory.profiler as {
    map?: Record<string, unknown>;
    totalTime?: number;
    enabledTick?: number;
    disableTick?: number | false;
    type?: string;
    filter?: string;
  };

  // Recover from stale/corrupted profiler state to avoid runtime crashes inside screeps-profiler.
  if (!profilerMemory.map || typeof profilerMemory.map !== "object" || Array.isArray(profilerMemory.map)) {
    Memory.profiler = null;
    console.log("Profiler state was invalid and has been reset. Start it again with Game.profiler.profile(...)");
    return;
  }

  if (typeof profilerMemory.totalTime !== "number") {
    profilerMemory.totalTime = 0;
  }
}

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
const mainLoop = () => {
  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }

  // Automatically delete memory of missing flags
  if (Memory.flags) {
    for (const name in Memory.flags) {
      if (!(name in Game.flags)) {
        delete Memory.flags[name];
      }
    }
  }

  const overseer: Overseer = new Overseer();
  overseer.refresh();

  GetRoomObjects.getAllMyCreeps().forEach(creep => {
    const creepBase: CreepBase = new CreepBase(creep);
    creepBase.workTheTask();
    creepBase.updateSomeMemoryAtTheEndOfTheTick();
  });

  // We can generate a pixel when the bucket is full
  if (Helper.getCashedMemory("PersistentWorld", false) && Game.cpu.bucket === 10000) {
    Game.cpu.generatePixel();
  }

  // Remove all construction sites.
  // const room = Game.rooms["E47S7"];
  // const getAllRampartsAndWallsToDelete = room.find(FIND_CONSTRUCTION_SITES, {
  //   filter: structure => {
  //     return structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART;
  //   }
  // });
  // getAllRampartsAndWallsToDelete.forEach(structure => {
  //   structure.remove();
  // });
  executeTestFlag();
};

export const loop = ErrorMapper.wrapLoop(() => {
  normalizeProfilerMemory();
  profiler.wrap(mainLoop);
});

export function executeTestFlag() {
  if (!Game.flags) return;
  const testFlag = Game.flags.Test;
  if (!testFlag) return;
  if (testFlag.color === COLOR_WHITE) {
    Game.flags["Attack-W7N3-4-1"].setPosition(new RoomPosition(48, 26, "W7N3"));
  } else {
    Game.flags["Attack-W7N3-4-1"].setPosition(new RoomPosition(1, 26, "W6N3"));
  }
  testFlag.remove();
  //   const exitDir = Game.map.findExit(testFlag.pos.roomName, "E23N15");
  //   if (exitDir === ERR_NO_PATH || exitDir === ERR_INVALID_ARGS) return;
  //   const room = Game.rooms[testFlag.pos.roomName];
  //   const exits = room.find(exitDir);

  //   // const moveTarget = exits[0];
  //   let bestCost = Infinity;
  //   let bestPath: PathFinderPath | null = null;
  //   let costMatrix: CostMatrix;
  //   for (const exit of exits) {
  //     const result = Helper.simplePathFinderWithObstacles(testFlag.pos, exit);
  //     if (result.cost < bestCost) {
  //       bestCost = result.cost;
  //       bestPath = result;
  //     }
  //   }

  //   for (let i = 0; i < 50; i++) {
  //     for (let j = 0; j < 50; j++) {
  //       if (costMatrix!) {
  //         const cost = costMatrix!.get(i, j);
  //         room.visual.text(cost.toString(), i, j, { font: 0.5, color: "#ff0000" });
  //       }
  //     }
  //   }

  //   if (!bestPath) {
  //     console.log("No path found");
  //     return;
  //   }

  //   // visualize path
  //   Game.rooms[testFlag.pos.roomName].visual.poly(
  //     bestPath.path.filter(p => p.roomName === testFlag.pos.roomName),
  //     { stroke: "#ffffff" }
  //   );
  //   Game.rooms[testFlag.pos.roomName].visual.text(
  //     `Path length: ${bestPath.path.length}, cost: ${bestPath.cost}`,
  //     testFlag.pos.x,
  //     testFlag.pos.y - 1
  //   );
}
