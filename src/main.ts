import { ErrorMapper } from "utils/ErrorMapper";
import Overseer from "Overseer";
import { CreepBase } from "CreepBase";
import { GetRoomObjects } from "Helpers/GetRoomObjects";
import "./Prototypes/RoomVisual"; // Prototypes used in Visualizer class

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
  });

  // We can generate a pixel when the bucket is full
  if(!Memory.Keys.IsSeason && Game.cpu.bucket == 10000){
    Game.cpu.generatePixel();
  }
};
