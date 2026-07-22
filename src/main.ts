import { ErrorMapper } from "utils/ErrorMapper";
import Overseer from "Overseer";
import { CreepBase } from "CreepBase";
import { GetRoomObjects } from "Helpers/GetRoomObjects";
import "./Prototypes/RoomVisual"; // Prototypes used in Visualizer class
import { Helper } from "Helpers/Helper";

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
// export const loop = ErrorMapper.wrapLoop(() => { // Temporarily disable error mapper
export const loop = () => {
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
